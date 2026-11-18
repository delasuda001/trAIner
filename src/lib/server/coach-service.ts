import "server-only";

import type { z } from "zod";
import { getLlmClient } from "@/lib/coach";
import { createClaudeAgentClient } from "@/lib/coach/claude-agent-client";
import { LLM_FAILURE_MESSAGES, LlmError, type LlmClient, type LlmFailureKind } from "@/lib/coach/llm";
import { buildWeeklyPrompt, WEEKLY_MODEL, WEEKLY_PROMPT_VERSION, WEEKLY_SYSTEM_PROMPT, weeklyReviewJsonSchema, weeklyReviewSchema, type WeeklyReview } from "@/lib/coach/weekly-review";
import { buildWeeklyDossier } from "./weekly-dossier";
import { allowedNumbers, collectText, excerpt, findUnsupportedMultiples, findUnsupportedNumbers, findZoneContradictions } from "@/lib/coach/number-guard";
import { zoneOf } from "@/lib/engine/zones";
import { goalForCoach } from "@/lib/goal/goal";
import { buildOutlookPayload, buildOutlookPrompt, OUTLOOK_PROMPT_VERSION, OUTLOOK_SYSTEM_PROMPT, outlookCoachJsonSchema, outlookCoachSchema, type OutlookCoachOutput } from "@/lib/coach/outlook-coach";
import { buildSessionPayload, buildSessionPrompt, normalizeSessionOutput, SESSION_PROMPT_VERSION, SESSION_SYSTEM_PROMPT, sessionCoachJsonSchema, sessionCoachSchema, type SessionCoachOutput } from "@/lib/coach/session-coach";
import { createCoachOutputRepository } from "@/lib/db/repositories/coach-output-repository";
import { requireActiveMember } from "@/lib/profiles/context";
import { systemPromptFor } from "@/lib/coach/athlete";
import { fingerprintIsCurrent, hashPayload, storedFingerprint } from "@/lib/coach/fingerprint";
import { checkQuota } from "./quota";
import { recordFailure, recordUsage } from "./usage";
import { analyzeSession, getDashboard, loadContext, type Dashboard, type SessionAnalysis } from "./analytics";

export type CoachResult<T> =
  | { status: "ready"; output: T; model: string; createdAt: string }
  | { status: "missing"; previous?: { output: T; model: string; createdAt: string; promptVersion: string } }
  | { status: "error"; kind: LlmFailureKind; message: string };

type Job<T> = {
  kind: "session" | "outlook" | "weekly";
  /** Client LLM imposé (ex. Opus pour le bilan hebdomadaire) ; sinon le modèle choisi dans les paramètres. */
  client?: LlmClient;
  subject: string;
  promptVersion: string;
  payload: unknown;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  /** Relit une sortie en cache (format éventuellement antérieur) ; null si illisible. */
  normalize?: (value: unknown) => T | null;
  /** Zone FC d'une valeur, pour rejeter une zone mal attribuée dans le texte. */
  zoneOf: (heartRate: number) => number;
  /**
   * Charge utile recalculée SANS objectif. Son empreinte est gardée à côté de l'empreinte
   * complète (« complète~sans-objectif ») : saisir ou changer l'objectif ne périme pas une
   * analyse passée. Les sorties enregistrées avant (une seule empreinte) se lisent comme avant.
   */
  goalFreePayload?: () => unknown;
};

const inFlight = new Map<string, Promise<CoachResult<unknown>>>();

function hashOf(job: Job<unknown>): string {
  return hashPayload(job.promptVersion, job.payload);
}

function storedHash(job: Job<unknown>): string {
  return storedFingerprint(job.promptVersion, job.payload, job.goalFreePayload?.() ?? null);
}

function cached<T>(job: Job<T>): CoachResult<T> {
  const latest = createCoachOutputRepository().latest(job.kind, job.subject);
  if (!latest) return { status: "missing" };
  const raw: unknown = JSON.parse(latest.outputJson);
  const output = job.normalize ? job.normalize(raw) : (raw as T);
  if (output == null) return { status: "missing" };
  // Données modifiées depuis (ressenti, nouvelles séances…) : on garde l'ancienne analyse sous la main pour l'afficher comme « à mettre à jour ».
  if (!fingerprintIsCurrent(latest.inputHash, job.promptVersion, job.payload, job.goalFreePayload)) return { status: "missing", previous: { output, model: latest.model, createdAt: latest.createdAt, promptVersion: latest.promptVersion } };
  return { status: "ready", output, model: latest.model, createdAt: latest.createdAt };
}

/** `preparation` : appel lancé par Bastien pour préparer un invité (compté à part, hors plafonds personnels). */
async function generate<T>(job: Job<T>, options: { preparation?: boolean } = {}): Promise<CoachResult<T>> {
  const hit = cached(job);
  if (hit.status === "ready") return hit;
  const inputHash = hashOf(job as Job<unknown>);
  const key = `${requireActiveMember().id}:${job.kind}:${job.subject}:${inputHash}`;
  const running = inFlight.get(key);
  if (running) return running as Promise<CoachResult<T>>;
  // Plafonds du test familial : vérifiés seulement quand un appel serait réellement fait.
  const quota = checkQuota(undefined, options);
  const usageKind = options.preparation ? "prepare" : job.kind;
  if (!quota.allowed) return { status: "error", kind: "quota", message: quota.message };

  const task = (async (): Promise<CoachResult<T>> => {
    const allowed = allowedNumbers(job.payload);
    let prompt = job.prompt;
    try {
      // Deux essais au plus : le second signale à Claude les chiffres non sourcés du premier.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let response;
        try {
          response = await (job.client ?? getLlmClient()).generateStructured({ system: job.system, prompt, schema: job.schema, jsonSchema: job.jsonSchema });
        } catch (error) {
          recordFailure(usageKind, job.subject, (job.client ?? getLlmClient()).name, error);
          if (attempt === 1 && error instanceof LlmError && error.kind === "invalid_output") {
            console.warn(`[coach] ${job.kind} : format refusé (essai 1), nouvel essai`);
            prompt = `${job.prompt}\n\nATTENTION : ta réponse précédente ne respectait pas le format (longueurs maximales). Fais plus court.`;
            continue;
          }
          throw error;
        }
        const text = collectText(response.data);
        const unsupported = [...findUnsupportedNumbers(text, allowed), ...findZoneContradictions(text, job.zoneOf), ...findUnsupportedMultiples(text, job.payload)];
        recordUsage(usageKind, job.subject, response.model, unsupported.length ? "rejected" : "ok", response.usage);
        if (unsupported.length === 0) {
          const row = createCoachOutputRepository().save({ kind: job.kind, subject: job.subject, inputHash: storedHash(job as Job<unknown>), model: response.model, promptVersion: job.promptVersion, output: response.data });
          return { status: "ready", output: response.data, model: response.model, createdAt: row.createdAt };
        }
        console.warn(`[coach] ${job.kind} : chiffres ou zones non sourcés (essai ${attempt}) : ${unsupported.map((token) => excerpt(text, token.split(" ")[0])).join(" | ")}`);
        prompt = `${job.prompt}\n\nATTENTION : ta réponse précédente contenait des erreurs (${unsupported.join(" ; ")}). Réécris-la en n'utilisant que des chiffres et des zones présents tels quels dans la charge utile.`;
      }
      throw new LlmError("invalid_output", "Chiffres non sourcés");
    } catch (error) {
      const kind: LlmFailureKind = error instanceof LlmError ? error.kind : "unavailable";
      console.warn(`[coach] ${job.kind} en échec (${kind}) : ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
      return { status: "error", kind, message: LLM_FAILURE_MESSAGES[kind] };
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task as Promise<CoachResult<unknown>>);
  return task;
}

function sessionPayload(analysis: SessionAnalysis) {
  return buildSessionPayload({
    session: analysis.activity,
    metrics: analysis.metrics,
    deltas: analysis.deltas,
    verdict: analysis.verdict,
    comparables: analysis.comparables,
    zones: analysis.profile.zones,
    lactateThresholdSpeedMps: analysis.profile.lactateThresholdSpeedMps,
    context: analysis.context,
    goal: goalForCoach(analysis.goal, analysis.activity.localDate),
    thresholdBasis: analysis.profile.threshold?.basis ?? null,
    goalGaps: analysis.goalGaps.map((gap) => gap.summary),
    feeling: analysis.feeling,
    prescription: analysis.prescription,
  });
}

/** La même séance analysée comme si aucun objectif n'était renseigné. */
function goalFreeSessionPayload(activityId: string): unknown {
  const context = loadContext();
  const analysis = analyzeSession(activityId, { ...context, goal: null });
  return analysis ? sessionPayload(analysis) : null;
}

function sessionJob(analysis: SessionAnalysis): Job<SessionCoachOutput> {
  const payload = sessionPayload(analysis);
  return { goalFreePayload: () => goalFreeSessionPayload(analysis.activity.id), normalize: normalizeSessionOutput, zoneOf: (hr: number) => zoneOf(hr, analysis.profile.zones), kind: "session", subject: analysis.activity.id, promptVersion: SESSION_PROMPT_VERSION, payload, system: systemPromptFor(SESSION_SYSTEM_PROMPT, { isAdmin: requireActiveMember().role === "admin", runsPerWeek12w: analysis.context.rhythm.runsPerWeek12w }), prompt: buildSessionPrompt(payload), schema: sessionCoachSchema, jsonSchema: sessionCoachJsonSchema as unknown as Record<string, unknown> };
}

function outlookJob(dashboard: Dashboard): Job<OutlookCoachOutput> {
  const payload = buildOutlookPayload({ suggestion: dashboard.suggestion, progression: dashboard.progression, recovery: dashboard.recovery, load: dashboard.load, goal: goalForCoach(dashboard.goal, dashboard.today), lastSameType: dashboard.lastSameType });
  return { zoneOf: (hr: number) => zoneOf(hr, dashboard.profile.zones), kind: "outlook", subject: "current", promptVersion: OUTLOOK_PROMPT_VERSION, payload, system: systemPromptFor(OUTLOOK_SYSTEM_PROMPT, { isAdmin: requireActiveMember().role === "admin", runsPerWeek12w: dashboard.rhythm.runsPerWeek12w }), prompt: buildOutlookPrompt(payload), schema: outlookCoachSchema, jsonSchema: outlookCoachJsonSchema as unknown as Record<string, unknown> };
}

/** Lecture seule : jamais d'appel à Claude au chargement d'une page. */
export function readSessionCoach(analysis: SessionAnalysis): CoachResult<SessionCoachOutput> {
  return cached(sessionJob(analysis));
}

export function generateSessionCoach(analysis: SessionAnalysis): Promise<CoachResult<SessionCoachOutput>> {
  return generate(sessionJob(analysis));
}

/** Préparation d'un invité par Bastien : mêmes analyses, comptées « préparation ». */
export function prepareSessionCoach(analysis: SessionAnalysis): Promise<CoachResult<SessionCoachOutput>> {
  return generate(sessionJob(analysis), { preparation: true });
}

export function prepareOutlookCoach(dashboard: Dashboard): Promise<CoachResult<OutlookCoachOutput>> {
  return generate(outlookJob(dashboard), { preparation: true });
}

export function readOutlookCoach(dashboard: Dashboard): CoachResult<OutlookCoachOutput> {
  return cached(outlookJob(dashboard));
}

export function generateOutlookCoach(dashboard: Dashboard): Promise<CoachResult<OutlookCoachOutput>> {
  return generate(outlookJob(dashboard));
}

/** Sorties du coach reprises par un profil de test : séances (identifiants) et conseil du jour. */
export type AdoptableOutputs = { sessions: string[]; outlook: boolean };

/**
 * Sorties à jour du profil actif (Bastien) pour ses `limit` dernières séances et le conseil du
 * jour : lecture seule, aucun appel.
 */
export function currentCoachOutputs(limit: number): AdoptableOutputs {
  const context = loadContext();
  const sessions: string[] = [];
  for (const run of context.runs.slice(-limit)) {
    const analysis = analyzeSession(run.id, context);
    if (analysis && cached(sessionJob(analysis)).status === "ready") sessions.push(run.id);
  }
  const outlook = context.runs.length > 0 && cached(outlookJob(getDashboard())).status === "ready";
  return { sessions, outlook };
}

/**
 * Profil de test (base copiée de Bastien) : les sorties à jour chez Bastien sont réétiquetées
 * avec l'empreinte de la charge utile du profil actif (vouvoyée), pour être reprises sans appel.
 * Le texte reste celui écrit pour Bastien. Renvoie le nombre de sorties reprises.
 */
export function adoptCoachOutputs(outputs: AdoptableOutputs): number {
  const repository = createCoachOutputRepository();
  const context = loadContext();
  let adopted = 0;
  const adopt = (job: Job<unknown>) => {
    const latest = repository.latest(job.kind, job.subject);
    if (!latest) return;
    repository.setInputHash(latest.id, storedHash(job));
    adopted += 1;
  };
  for (const id of outputs.sessions) {
    const analysis = analyzeSession(id, context);
    if (analysis) adopt(sessionJob(analysis) as Job<unknown>);
  }
  if (outputs.outlook) adopt(outlookJob(getDashboard()) as Job<unknown>);
  return adopted;
}

function weeklyJob(weekStart: string, zones: Parameters<typeof zoneOf>[1]): Job<WeeklyReview> {
  const payload = buildWeeklyDossier(weekStart);
  return {
    kind: "weekly",
    subject: weekStart,
    client: createClaudeAgentClient(WEEKLY_MODEL),
    promptVersion: WEEKLY_PROMPT_VERSION,
    payload,
    system: WEEKLY_SYSTEM_PROMPT,
    prompt: buildWeeklyPrompt(payload),
    schema: weeklyReviewSchema,
    jsonSchema: weeklyReviewJsonSchema as unknown as Record<string, unknown>,
    normalize: (value) => { const parsed = weeklyReviewSchema.safeParse(value); return parsed.success ? parsed.data : null; },
    zoneOf: (hr: number) => zoneOf(hr, zones),
  };
}

/** Bilan hebdomadaire (Opus) : sur bouton ou par la tâche de nuit, jamais au chargement d'une page. */
export function generateWeeklyReview(weekStart: string, zones: Parameters<typeof zoneOf>[1]): Promise<CoachResult<WeeklyReview>> {
  return generate(weeklyJob(weekStart, zones));
}

export type StoredWeeklyReview = { weekStart: string; output: WeeklyReview; model: string; createdAt: string; promptVersion: string };

/** Bilans déjà produits (lecture seule), plus récents d'abord. */
export function listWeeklyReviews(limit = 12): StoredWeeklyReview[] {
  const rows = createCoachOutputRepository().recent("weekly", limit * 3);
  const seen = new Set<string>();
  const reviews: StoredWeeklyReview[] = [];
  for (const row of rows) {
    if (seen.has(row.subject)) continue;
    const parsed = weeklyReviewSchema.safeParse(JSON.parse(row.outputJson));
    if (!parsed.success) continue;
    seen.add(row.subject);
    reviews.push({ weekStart: row.subject, output: parsed.data, model: row.model, createdAt: row.createdAt, promptVersion: row.promptVersion });
  }
  return reviews.sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, limit);
}
