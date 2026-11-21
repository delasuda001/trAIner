import "server-only";

import { z } from "zod";
import { budgetFromEnv, canSpend, type BudgetConfig } from "@/lib/bench/budget";
import { automaticTokensSince } from "@/lib/bench/runner";
import { createClaudeAgentClient } from "@/lib/coach/claude-agent-client";
import { LlmError, type LlmClient } from "@/lib/coach/llm";
import { buildReviewPrompt, REVIEW_MAX_CASES, REVIEW_MODEL, REVIEW_SYSTEM_PROMPT, reviewJsonSchema, reviewSchema, type ReviewCase, type ReviewDossier } from "@/lib/coach/quality-review";
import { addDays } from "@/lib/dates";
import { createCoachOutputRepository } from "@/lib/db/repositories/coach-output-repository";
import { zoneRange } from "@/lib/engine/zones";
import { formatPace } from "@/lib/formatters";
import { adminMember, getRegistry, runAs, toMember } from "@/lib/profiles/context";
import { stringsOf } from "@/lib/quality/coherence";
import { analyzeSession, getDashboard, loadContext } from "@/lib/server/analytics";
import { outlookPayload, readOutlookCoach, readSessionCoach, sessionPayload } from "@/lib/server/coach-service";
import { easyBaselineAt } from "@/lib/server/quality-service";
import { readRateLimits, recordUsage, refreshRateLimits } from "@/lib/server/usage";

/**
 * Relecture indépendante par lots (voir lib/coach/quality-review.ts) : un appel par profil,
 * au plus 6 analyses récentes non encore relues + le conseil du jour. Jamais après chaque analyse.
 * Plafonds communs au banc (nuit, semaine, fenêtres de quota) ; consommation comptée chez Bastien.
 */

const SEEN_KEY = "quality_review_seen";
const seenSchema = z.record(z.string(), z.string());
/** Estimation prudente d'un appel de relecture (dossier ≈ 4–6 k + surcouche du SDK ≈ 3,5 k). */
export const REVIEW_ESTIMATE = 12_000;
const SESSION_FACT_KEYS = ["seance", "structure", "temps_en_zones", "comparaison", "contexte_de_la_seance", "causes_possibles", "verdict_calcule", "consignes_moteur"] as const;

export type ReviewRunSummary = { profiles: number; cases: number; findings: number; stoppedBecause: string | null };

type ProfileBatch = { profileId: string; dossier: ReviewDossier; subjects: Map<string, { kind: "session" | "outlook"; seenKey: string; outputId: string }> };

function pick(payload: unknown, keys: readonly string[]): Record<string, unknown> {
  const source = (payload ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** Dossier d'un profil (dans son contexte) : repères + cas récents non relus. */
function collectBatch(profileId: string, sinceDays: number, seen: Record<string, string>): ProfileBatch | null {
  const context = loadContext();
  if (!context.runs.length) return null;
  const dashboard = getDashboard();
  const from = addDays(context.today, -sinceDays);
  const cases: ReviewCase[] = [];
  const subjects: ProfileBatch["subjects"] = new Map();
  const repository = createCoachOutputRepository();
  for (const run of [...context.runs].reverse().filter((entry) => entry.localDate >= from)) {
    if (cases.length >= REVIEW_MAX_CASES) break;
    const analysis = analyzeSession(run.id, context);
    if (!analysis) continue;
    const result = readSessionCoach(analysis);
    const stored = repository.latest("session", run.id);
    if (result.status !== "ready" || !stored) continue;
    const seenKey = `${profileId}|session|${run.id}`;
    if (seen[seenKey] === stored.id) continue;
    cases.push({ id: run.id, type: "séance", faits: pick(sessionPayload(analysis), SESSION_FACT_KEYS), texte_affiche: stringsOf(result.output) });
    subjects.set(run.id, { kind: "session", seenKey, outputId: stored.id });
  }
  const outlook = readOutlookCoach(dashboard);
  const storedOutlook = repository.latest("outlook", "current");
  if (outlook.status === "ready" && storedOutlook && seen[`${profileId}|outlook|current`] !== storedOutlook.id) {
    cases.push({ id: "conseil-du-jour", type: "conseil du jour", faits: outlookPayload(dashboard), texte_affiche: stringsOf(outlook.output) });
    subjects.set("conseil-du-jour", { kind: "outlook", seenKey: `${profileId}|outlook|current`, outputId: storedOutlook.id });
  }
  if (!cases.length) return null;
  const easy = easyBaselineAt(context, addDays(context.today, 1));
  const zones = dashboard.profile.zones;
  return {
    profileId,
    subjects,
    dossier: {
      coureur: {
        niveau: dashboard.level.level,
        sorties_par_semaine_12_sem: dashboard.rhythm.runsPerWeek12w,
        zones_fc: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((zone) => [`Z${zone}`, `${zoneRange(zone, zones)[0]}–${zoneRange(zone, zones)[1]} bpm`])),
        zones_note: dashboard.profile.easyZones ? `Z2 recalée sur ses footings (médiane ${dashboard.profile.easyZones.easyMedianBpm} bpm) ; la montre la faisait finir à ${dashboard.profile.easyZones.watchZ2HighBpm} bpm` : "zones de la montre",
        footings_16_sem: easy ? `${formatPace(1000 / easy.medianPaceS)} à ${Math.round(easy.medianHeartRateBpm)} bpm en médiane (${easy.runs} sorties)` : "trop peu de footings",
        seuil: dashboard.profile.threshold?.basis ?? "inconnu",
        objectif: dashboard.goal?.title ?? "aucun",
      },
      cas: cases,
    },
  };
}

/**
 * Lance la relecture. `client` injectable (tests, coach simulé). Les constats remplacent ceux de
 * la relecture précédente, sujet par sujet ; un sujet relu ne l'est plus tant que l'analyse ne change pas.
 */
export async function runQualityReview(options: { sinceDays?: number; config?: BudgetConfig; client?: LlmClient; nightStartIso?: string } = {}): Promise<ReviewRunSummary> {
  const registry = getRegistry();
  const config = options.config ?? budgetFromEnv(process.env);
  const client = options.client ?? createClaudeAgentClient(REVIEW_MODEL);
  const nightStartIso = options.nightStartIso ?? new Date(Date.now() - 12 * 3_600_000).toISOString();
  const seen = registry.getSetting(SEEN_KEY, seenSchema) ?? {};
  const summary: ReviewRunSummary = { profiles: 0, cases: 0, findings: 0, stoppedBecause: null };

  for (const record of registry.list().filter((entry) => entry.disabledAt == null)) {
    const batch = runAs(toMember(record), () => collectBatch(record.id, options.sinceDays ?? 7, seen));
    if (!batch) continue;
    await refreshRateLimits({ maxAgeMs: 2 * 60_000, waitMs: 10_000 });
    // Budget et quota vérifiés avant chaque appel, dans le contexte de Bastien (sa base porte l'usage automatique).
    const decision = runAs(adminMember(), () => canSpend({
      estimate: REVIEW_ESTIMATE,
      nightUsed: automaticTokensSince(nightStartIso),
      weekUsed: automaticTokensSince(new Date(Date.now() - 7 * 86_400_000).toISOString()),
      config,
      windows: Object.values(readRateLimits()).map((window) => ({ window: window.window ?? "inconnue", utilization: window.utilization, resetsAt: window.resetsAt, status: window.status })),
      now: new Date(),
    }));
    if (!decision.ok) {
      summary.stoppedBecause = decision.reason;
      break;
    }
    try {
      const response = await client.generateStructured({ system: REVIEW_SYSTEM_PROMPT, prompt: buildReviewPrompt(batch.dossier), schema: reviewSchema, jsonSchema: reviewJsonSchema as unknown as Record<string, unknown> });
      runAs(adminMember(), () => recordUsage("review", `relecture/${record.id}`, response.model, "ok", response.usage));
      summary.profiles += 1;
      summary.cases += batch.dossier.cas.length;
      for (const [caseId, subject] of batch.subjects) {
        const findings = response.data.findings
          .filter((finding) => finding.case_id === caseId)
          .slice(0, 3)
          .map((finding) => ({ code: `review_${finding.category}`, severity: finding.severity, where: subject.kind === "session" ? "analyse Claude" : "conseil du jour (Claude)", message: `${finding.quote ? `« ${finding.quote} » : ` : ""}${finding.issue}${finding.rule_idea ? ` Règle possible : ${finding.rule_idea}` : ""}` }));
        registry.replaceQualityFindings({ profileId: record.id, subjectKind: subject.kind, subjectId: subject.kind === "session" ? caseId : "current", source: "review" }, findings);
        summary.findings += findings.length;
        seen[subject.seenKey] = subject.outputId;
      }
      if (response.data.summary.trim()) registry.replaceQualityFindings({ profileId: record.id, subjectKind: "profile", subjectId: "relecture", source: "review" }, [{ code: "review_summary", severity: "info", where: "synthèse de la relecture", message: response.data.summary.trim() }]);
      registry.setSetting(SEEN_KEY, seen);
    } catch (error) {
      if (error instanceof LlmError && error.usage) runAs(adminMember(), () => recordUsage("review", `relecture/${record.id}`, client.name, "error", error.usage));
      summary.stoppedBecause = error instanceof Error ? error.message.slice(0, 200) : String(error);
      if (error instanceof LlmError && (error.kind === "rate_limited" || error.kind === "auth")) break;
    }
  }
  return summary;
}

let running = false;

export function reviewIsRunning(): boolean {
  return running;
}

/** Lancement en arrière-plan (bouton de Paramètres) ; un seul à la fois. */
export function startQualityReview(): boolean {
  if (running) return false;
  running = true;
  void runQualityReview()
    .then((summary) => console.info(`[qualité] relecture : ${summary.cases} cas, ${summary.findings} constat(s)${summary.stoppedBecause ? `, arrêt : ${summary.stoppedBecause}` : ""}`))
    .catch((error: unknown) => console.warn(`[qualité] relecture en échec : ${error instanceof Error ? error.message : String(error)}`))
    .finally(() => { running = false; });
  return true;
}
