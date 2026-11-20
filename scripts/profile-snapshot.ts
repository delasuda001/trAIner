/**
 * Photographie complète du moteur pour UN profil : pour chaque course, type de séance,
 * verdict, consignes et charge utile envoyée à Claude ; plus le tableau de bord
 * (suggestion, progression, niveau) et la charge utile du conseil du jour.
 * Aucun appel à Claude. Sert à vérifier qu'un changement du moteur ne modifie pas
 * les analyses d'un profil (diff avant / après).
 *
 * À lancer sur une COPIE des bases (le calcul des métriques les met en cache en base) :
 *   SILLAGE_PROFILES_DIR=/copie/profiles SILLAGE_REGISTRY_PATH=/copie/sillage.db DATABASE_URL=file:/copie/run-insights.db \
 *   npx tsx --conditions=react-server scripts/profile-snapshot.ts <profil> [AAAA-MM-JJ] > photo.json
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const profileId = process.argv[2];
  if (!profileId) throw new Error("Profil manquant : profile-snapshot.ts <profil>");
  const { getRegistry, runAs, toMember } = await import("@/lib/profiles/context");
  const { analyzeSession, getDashboard, loadContext } = await import("@/lib/server/analytics");
  const { buildSessionPayload } = await import("@/lib/coach/session-coach");
  const { buildOutlookPayload } = await import("@/lib/coach/outlook-coach");
  const { goalForCoach } = await import("@/lib/goal/goal");
  const record = getRegistry().find(profileId);
  if (!record) throw new Error(`Profil inconnu : ${profileId}`);
  runAs(toMember(record), () => {
    const context = loadContext();
    const sessions = context.runs.map((run) => {
      const analysis = analyzeSession(run.id, context);
      if (!analysis) return { id: run.id, analysis: null };
      const payload = buildSessionPayload({ session: analysis.activity, metrics: analysis.metrics, deltas: analysis.deltas, verdict: analysis.verdict, comparables: analysis.comparables, zones: analysis.profile.zones, lactateThresholdSpeedMps: analysis.profile.lactateThresholdSpeedMps, thresholdBasis: analysis.profile.threshold?.basis ?? null, goalGaps: analysis.goalGaps.map((gap) => gap.summary), context: analysis.context, goal: goalForCoach(analysis.goal, analysis.activity.localDate), feeling: analysis.feeling, prescription: analysis.prescription });
      return { id: run.id, date: run.localDate, kind: run.metrics.kind, family: run.metrics.family, verdict: { level: analysis.verdict.level, headline: analysis.verdict.headline }, prescription: analysis.prescription, payload };
    });
    const dashboard = getDashboard();
    const outlook = buildOutlookPayload({ suggestion: dashboard.suggestion, progression: dashboard.progression, recovery: dashboard.recovery, load: dashboard.load, goal: goalForCoach(dashboard.goal, dashboard.today), lastSameType: dashboard.lastSameType, goalGaps: dashboard.goalGaps.map((gap) => gap.summary) });
    console.log(JSON.stringify({ profile: profileId, today: dashboard.today, zones: dashboard.profile.zones, threshold: dashboard.profile.threshold?.basis ?? null, level: dashboard.level, goalPages: dashboard.goalPages, suggestion: dashboard.suggestion, progression: dashboard.progression, loadAlert: dashboard.loadAlert, outlookPayload: outlook, sessions }, null, 1));
  });
}

void main();
