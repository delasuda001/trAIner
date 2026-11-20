import "server-only";

import { addDays, daysBetween } from "@/lib/dates";
import { paceSeconds } from "@/lib/engine/activity-metrics";
import { median } from "@/lib/engine/stats";
import { checkEasyTargets, checkSession, checkText, stringsOf, type EasyBaseline, type Finding } from "@/lib/quality/coherence";
import { activeMember, getRegistry } from "@/lib/profiles/context";
import { registerForRole } from "@/lib/register";
import type { Context, Dashboard, SessionAnalysis } from "@/lib/server/analytics";

/**
 * Contrôle de cohérence après chaque analyse (voir `lib/quality/coherence.ts`) : constats
 * enregistrés dans le registre central, vus par Bastien seul dans Paramètres. Jamais bloquant :
 * une erreur du contrôle ne doit pas empêcher d'afficher une analyse.
 */

const EASY_WINDOW_DAYS = 112;

/** Repère facile de la personne à une date : ses sorties faciles continues des 16 semaines précédentes. */
export function easyBaselineAt(context: Pick<Context, "runs">, date: string): EasyBaseline | null {
  const runs = context.runs.filter((run) => run.localDate < date && daysBetween(run.localDate, date) < EASY_WINDOW_DAYS && run.sport === "running" && run.metrics.family === "easy" && run.metrics.structure === "continuous" && run.metrics.mainSpeedMps && run.metrics.mainHeartRateBpm);
  if (!runs.length) return null;
  return {
    medianPaceS: median(runs.map((run) => paceSeconds(run.metrics.mainSpeedMps as number))) as number,
    medianHeartRateBpm: median(runs.map((run) => run.metrics.mainHeartRateBpm as number)) as number,
    runs: runs.length,
    samples: runs.map((run) => ({ paceS: paceSeconds(run.metrics.mainSpeedMps as number), heartRateBpm: run.metrics.mainHeartRateBpm as number })),
  };
}

function longestBefore(context: Pick<Context, "runs">, analysis: SessionAnalysis): number | null {
  const date = analysis.activity.localDate;
  const values = context.runs.filter((run) => run.startTimeUtc < analysis.activity.startTimeUtc && run.localDate >= addDays(date, -84)).map((run) => run.movingTimeS ?? 0);
  return values.length ? Math.max(...values) : null;
}

export function checkSessionAnalysis(analysis: SessionAnalysis, context: Pick<Context, "runs">, coachOutput: unknown | null, role: string | null | undefined): Finding[] {
  const efficiency = analysis.deltas.paceAtEqualHrGainSPerKm;
  return checkSession({
    register: registerForRole(role),
    zones: analysis.profile.zones,
    easy: easyBaselineAt(context, analysis.activity.localDate),
    session: { kind: analysis.metrics.kind, family: analysis.metrics.family, movingTimeS: analysis.activity.movingTimeS, mainHeartRateBpm: analysis.metrics.mainHeartRateBpm, longestBeforeS: longestBefore(context, analysis) },
    verdict: { level: analysis.verdict.level, efficiencyTone: analysis.verdict.signals.find((signal) => signal.key === "efficiency")?.tone ?? null, efficiencyGainSPerKm: efficiency, spreadSPerKm: analysis.deltas.noise?.spreadSPerKm ?? null },
    prescription: analysis.prescription,
    texts: [
      ...stringsOf([analysis.verdict.headline, analysis.verdict.signals.map((signal) => signal.label)]).map((text) => ({ where: "verdict", text })),
      ...stringsOf(analysis.prescription).map((text) => ({ where: "consigne", text })),
      ...stringsOf(coachOutput).map((text) => ({ where: "analyse Claude", text })),
    ],
  });
}

export function checkOutlook(dashboard: Dashboard, context: Pick<Context, "runs">, coachOutput: unknown | null, role: string | null | undefined): Finding[] {
  const register = registerForRole(role);
  const primary = dashboard.suggestion.primary;
  const easy = easyBaselineAt(context, addDays(dashboard.today, 1));
  const findings: Finding[] = [];
  if (primary.target && ["endurance", "long", "recovery_run"].includes(primary.type) && primary.target.paceSlowMps) {
    findings.push(...checkEasyTargets({ zones: dashboard.profile.zones, easy, easyTarget: { paceSlowS: paceSeconds(primary.target.paceSlowMps), heartRateLow: primary.target.heartRateLow, heartRateHigh: primary.target.heartRateHigh } }, "séance proposée"));
  }
  const texts = [...stringsOf(dashboard.suggestion).map((text) => ({ where: "séance proposée", text })), ...stringsOf(coachOutput).map((text) => ({ where: "conseil du jour (Claude)", text }))];
  findings.push(...texts.flatMap((entry) => checkText(entry.text, entry.where, register)));
  const seen = new Set<string>();
  return findings.filter((finding) => (seen.has(finding.message) ? false : (seen.add(finding.message), true)));
}

/** Enregistre les constats du profil actif pour un sujet ; silencieux en cas d'erreur. */
export function recordFindings(subjectKind: "session" | "outlook", subjectId: string, findings: Finding[]): void {
  const member = activeMember();
  if (!member) return;
  try {
    getRegistry().replaceQualityFindings({ profileId: member.id, subjectKind, subjectId, source: "rules" }, findings);
  } catch (error) {
    console.warn(`[qualité] enregistrement impossible : ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Après une analyse de séance produite par Claude. */
export function afterSessionAnalysis(analysis: SessionAnalysis, context: Pick<Context, "runs">, output: unknown): void {
  try {
    recordFindings("session", analysis.activity.id, checkSessionAnalysis(analysis, context, output, activeMember()?.role));
  } catch (error) {
    console.warn(`[qualité] contrôle de séance en échec : ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Après un conseil du jour produit par Claude. */
export function afterOutlook(dashboard: Dashboard, context: Pick<Context, "runs">, output: unknown): void {
  try {
    recordFindings("outlook", "current", checkOutlook(dashboard, context, output, activeMember()?.role));
  } catch (error) {
    console.warn(`[qualité] contrôle du conseil en échec : ${error instanceof Error ? error.message : String(error)}`);
  }
}
