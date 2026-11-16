/**
 * Travail de nuit (lancé à 22 h par le LaunchAgent, voir scripts/launchd/) :
 * le dimanche, bilan hebdomadaire ; puis le banc de tests, dans la limite des plafonds.
 * Usage : npx tsx --conditions=react-server scripts/nightly.ts [--force] [--dry-run]
 *   --force   : ignore la fenêtre horaire 22 h – 5 h et l'usage récent de Bastien
 *   --dry-run : affiche ce qui serait fait, sans aucun appel à Claude
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { budgetFromEnv, canSpend, TASK_ESTIMATE } = await import("@/lib/bench/budget");
  const { automaticTokensSince, pendingTasks, runBench } = await import("@/lib/bench/runner");
  const { loadFixtures, logNightly } = await import("@/lib/bench/store");
  const { localDate } = await import("@/lib/dates");
  const { createUsageRepository } = await import("@/lib/db/repositories/usage-repository");
  const { getDashboard } = await import("@/lib/server/analytics");
  const { generateWeeklyReview, listWeeklyReviews } = await import("@/lib/server/coach-service");
  const { readRateLimits } = await import("@/lib/server/usage");
  const { defaultReviewWeek } = await import("@/lib/server/weekly-dossier");

  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const hour = now.getHours();
  const log = (line: string) => { console.log(line); if (!dryRun) logNightly(line); };

  // Mac endormi à 22 h : launchd relance au réveil ; hors 22 h – 5 h on saute la nuit pour ne pas prendre le quota du matin.
  if (!force && hour >= 5 && hour < 22) return log(`hors fenêtre (${hour} h) : nuit sautée`);
  const recent = createUsageRepository().since(new Date(now.getTime() - 2 * 3_600_000).toISOString()).filter((row) => row.kind === "session" || row.kind === "outlook" || row.kind === "chat");
  if (!force && recent.length) return log(`Bastien a utilisé le coach il y a moins de 2 h (${recent.length} appel(s)) : nuit sautée`);

  const config = budgetFromEnv(process.env);
  const nightStartIso = now.toISOString();
  const windows = () => Object.values(readRateLimits()).map((window) => ({ window: window.window ?? "inconnue", utilization: window.utilization, resetsAt: window.resetsAt, status: window.status }));
  log(`début (plafonds : ${config.nightTokens} par nuit, ${config.weekTokens} par semaine ; déjà ${automaticTokensSince(new Date(now.getTime() - 7 * 86_400_000).toISOString())} cette semaine)`);

  // Dimanche soir (ou cette nuit-là après minuit) : bilan de la semaine qui se termine.
  const day = hour < 5 ? new Date(now.getTime() - 6 * 3_600_000) : now;
  const today = localDate(day);
  const isSunday = day.getDay() === 0;
  if (isSunday) {
    const week = defaultReviewWeek(today);
    if (listWeeklyReviews(4).some((review) => review.weekStart === week)) log(`bilan de la semaine du ${week} déjà fait`);
    else {
      const decision = canSpend({ estimate: TASK_ESTIMATE.weekly, nightUsed: 0, weekUsed: automaticTokensSince(new Date(now.getTime() - 7 * 86_400_000).toISOString()), config, windows: windows(), now });
      if (!decision.ok) log(`bilan reporté : ${decision.reason}`);
      else if (dryRun) log(`(essai à blanc) bilan de la semaine du ${week}`);
      else {
        const result = await generateWeeklyReview(week, getDashboard().profile.zones);
        log(result.status === "ready" ? `bilan de la semaine du ${week} produit` : `bilan en échec : ${result.status === "error" ? result.message : result.status}`);
      }
    }
  }

  if (!loadFixtures().length) return log("banc : aucune séance figée (lancer scripts/bench-freeze.ts)");
  log(`banc : ${pendingTasks().length} tâche(s) en attente`);
  const summary = await runBench(config, { nightStartIso, dryRun });
  log(`banc : ${summary.done.length} tâche(s) faite(s), ${summary.remaining} restante(s)${summary.stoppedBecause ? `, arrêt : ${summary.stoppedBecause}` : ""} ; ${summary.tokensUsed} tokens cette nuit`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
