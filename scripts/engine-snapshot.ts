/**
 * Photographie du moteur sur la base de Bastien : pour chaque course, consignes et
 * empreinte de la charge utile envoyée à Claude ; plus la suggestion du jour.
 * Sert de test de non-régression (aucun appel à Claude) :
 *   npx tsx --conditions=react-server scripts/engine-snapshot.ts > avant.json
 *   (modification du moteur)
 *   npx tsx --conditions=react-server scripts/engine-snapshot.ts > apres.json && diff avant.json apres.json
 */
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { adminMember, runAs } = await import("@/lib/profiles/context");
  const { analyzeSession, getDashboard, loadContext } = await import("@/lib/server/analytics");
  const { buildSessionPayload } = await import("@/lib/coach/session-coach");
  const { buildOutlookPayload } = await import("@/lib/coach/outlook-coach");
  const { goalForCoach } = await import("@/lib/goal/goal");
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
  runAs(adminMember(), () => {
    const context = loadContext();
    const sessions = context.runs.map((run) => {
      const analysis = analyzeSession(run.id, context);
      if (!analysis) return { id: run.id, analysis: null };
      const payload = buildSessionPayload({ session: analysis.activity, metrics: analysis.metrics, deltas: analysis.deltas, verdict: analysis.verdict, comparables: analysis.comparables, zones: analysis.profile.zones, lactateThresholdSpeedMps: analysis.profile.lactateThresholdSpeedMps, thresholdBasis: analysis.profile.threshold?.basis ?? null, goalGaps: analysis.goalGaps.map((gap) => gap.summary), context: analysis.context, goal: goalForCoach(analysis.goal, analysis.activity.localDate), feeling: analysis.feeling, prescription: analysis.prescription });
      return { id: run.id, date: run.localDate, verdict: analysis.verdict.level, prescription: analysis.prescription, loadAlert: analysis.context.loadAlertBefore, payload: hash(payload) };
    });
    const dashboard = getDashboard();
    const outlook = buildOutlookPayload({ suggestion: dashboard.suggestion, progression: dashboard.progression, recovery: dashboard.recovery, load: dashboard.load, goal: goalForCoach(dashboard.goal, dashboard.today), lastSameType: dashboard.lastSameType });
    console.log(JSON.stringify({ sessions, suggestion: dashboard.suggestion, loadAlert: dashboard.loadAlert, outlookPayload: hash(outlook) }, null, 1));
  });
}

void main();
