import "server-only";

import { createHash } from "node:crypto";
import type { z } from "zod";
import { getLlmClient } from "@/lib/coach";
import { LLM_FAILURE_MESSAGES, LlmError, type LlmFailureKind } from "@/lib/coach/llm";
import { allowedNumbers, collectText, excerpt, findUnsupportedNumbers, findZoneContradictions } from "@/lib/coach/number-guard";
import { zoneOf } from "@/lib/engine/zones";
import { goalForCoach } from "@/lib/goal/goal";
import { buildOutlookPayload, buildOutlookPrompt, OUTLOOK_PROMPT_VERSION, OUTLOOK_SYSTEM_PROMPT, outlookCoachJsonSchema, outlookCoachSchema, type OutlookCoachOutput } from "@/lib/coach/outlook-coach";
import { buildSessionPayload, buildSessionPrompt, normalizeSessionOutput, SESSION_PROMPT_VERSION, SESSION_SYSTEM_PROMPT, sessionCoachJsonSchema, sessionCoachSchema, type SessionCoachOutput } from "@/lib/coach/session-coach";
import { createCoachOutputRepository } from "@/lib/db/repositories/coach-output-repository";
import { recordFailure, recordUsage } from "./usage";
import type { Dashboard, SessionAnalysis } from "./analytics";

export type CoachResult<T> =
  | { status: "ready"; output: T; model: string; createdAt: string }
  | { status: "missing"; previous?: { output: T; model: string; createdAt: string; promptVersion: string } }
  | { status: "error"; kind: LlmFailureKind; message: string };

type Job<T> = {
  kind: "session" | "outlook";
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
};

const inFlight = new Map<string, Promise<CoachResult<unknown>>>();

function hashOf(job: Job<unknown>): string {
  return createHash("sha256").update(job.promptVersion).update(JSON.stringify(job.payload)).digest("hex").slice(0, 32);
}

function cached<T>(job: Job<T>): CoachResult<T> {
  const latest = createCoachOutputRepository().latest(job.kind, job.subject);
  if (!latest) return { status: "missing" };
  const raw: unknown = JSON.parse(latest.outputJson);
  const output = job.normalize ? job.normalize(raw) : (raw as T);
  if (output == null) return { status: "missing" };
  // Données modifiées depuis (ressenti, nouvelles séances…) : on garde l'ancienne analyse sous la main pour l'afficher comme « à mettre à jour ».
  if (latest.inputHash !== hashOf(job as Job<unknown>)) return { status: "missing", previous: { output, model: latest.model, createdAt: latest.createdAt, promptVersion: latest.promptVersion } };
  return { status: "ready", output, model: latest.model, createdAt: latest.createdAt };
}

async function generate<T>(job: Job<T>): Promise<CoachResult<T>> {
  const hit = cached(job);
  if (hit.status === "ready") return hit;
  const inputHash = hashOf(job as Job<unknown>);
  const key = `${job.kind}:${job.subject}:${inputHash}`;
  const running = inFlight.get(key);
  if (running) return running as Promise<CoachResult<T>>;

  const task = (async (): Promise<CoachResult<T>> => {
    const allowed = allowedNumbers(job.payload);
    let prompt = job.prompt;
    try {
      // Deux essais au plus : le second signale à Claude les chiffres non sourcés du premier.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let response;
        try {
          response = await getLlmClient().generateStructured({ system: job.system, prompt, schema: job.schema, jsonSchema: job.jsonSchema });
        } catch (error) {
          recordFailure(job.kind, job.subject, getLlmClient().name, error);
          if (attempt === 1 && error instanceof LlmError && error.kind === "invalid_output") {
            console.warn(`[coach] ${job.kind} : format refusé (essai 1), nouvel essai`);
            prompt = `${job.prompt}\n\nATTENTION : ta réponse précédente ne respectait pas le format (longueurs maximales). Fais plus court.`;
            continue;
          }
          throw error;
        }
        const text = collectText(response.data);
        const unsupported = [...findUnsupportedNumbers(text, allowed), ...findZoneContradictions(text, job.zoneOf)];
        recordUsage(job.kind, job.subject, response.model, unsupported.length ? "rejected" : "ok", response.usage);
        if (unsupported.length === 0) {
          const row = createCoachOutputRepository().save({ kind: job.kind, subject: job.subject, inputHash, model: response.model, promptVersion: job.promptVersion, output: response.data });
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

function sessionJob(analysis: SessionAnalysis): Job<SessionCoachOutput> {
  const payload = buildSessionPayload({
    session: analysis.activity,
    metrics: analysis.metrics,
    deltas: analysis.deltas,
    verdict: analysis.verdict,
    comparables: analysis.comparables,
    zones: analysis.profile.zones,
    lactateThresholdSpeedMps: analysis.profile.lactateThresholdSpeedMps,
    context: analysis.context,
    goal: goalForCoach(analysis.goal, analysis.activity.localDate),
    feeling: analysis.feeling,
    prescription: analysis.prescription,
  });
  return { normalize: normalizeSessionOutput, zoneOf: (hr: number) => zoneOf(hr, analysis.profile.zones), kind: "session", subject: analysis.activity.id, promptVersion: SESSION_PROMPT_VERSION, payload, system: SESSION_SYSTEM_PROMPT, prompt: buildSessionPrompt(payload), schema: sessionCoachSchema, jsonSchema: sessionCoachJsonSchema as unknown as Record<string, unknown> };
}

function outlookJob(dashboard: Dashboard): Job<OutlookCoachOutput> {
  const payload = buildOutlookPayload({ suggestion: dashboard.suggestion, progression: dashboard.progression, recovery: dashboard.recovery, load: dashboard.load, goal: goalForCoach(dashboard.goal, dashboard.today), lastSameType: dashboard.lastSameType });
  return { zoneOf: (hr: number) => zoneOf(hr, dashboard.profile.zones), kind: "outlook", subject: "current", promptVersion: OUTLOOK_PROMPT_VERSION, payload, system: OUTLOOK_SYSTEM_PROMPT, prompt: buildOutlookPrompt(payload), schema: outlookCoachSchema, jsonSchema: outlookCoachJsonSchema as unknown as Record<string, unknown> };
}

/** Lecture seule : jamais d'appel à Claude au chargement d'une page. */
export function readSessionCoach(analysis: SessionAnalysis): CoachResult<SessionCoachOutput> {
  return cached(sessionJob(analysis));
}

export function generateSessionCoach(analysis: SessionAnalysis): Promise<CoachResult<SessionCoachOutput>> {
  return generate(sessionJob(analysis));
}

export function readOutlookCoach(dashboard: Dashboard): CoachResult<OutlookCoachOutput> {
  return cached(outlookJob(dashboard));
}

export function generateOutlookCoach(dashboard: Dashboard): Promise<CoachResult<OutlookCoachOutput>> {
  return generate(outlookJob(dashboard));
}
