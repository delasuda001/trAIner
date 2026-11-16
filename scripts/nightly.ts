/**
 * Banc de tests et bilan hebdomadaire, lancés à la main quand le quota de Bastien est disponible.
 * Usage : npm run bench -- [options]
 *   --budget=150000        plafond de tokens pour ce lancement (défaut : BENCH_NIGHT_BUDGET_TOKENS ou 40 000)
 *   --week-budget=200000   plafond sur 7 jours glissants (défaut : BENCH_WEEK_BUDGET_TOKENS ou 100 000)
 *   --max-five-hour=0.7    arrêt si la fenêtre de 5 h dépasse ce niveau (défaut 0,6)
 *   --only=a,b             ne traiter que ces variantes (la version en place est toujours faite d'abord)
 *   --weekly               produire d'abord le bilan de la dernière semaine complète s'il manque
 *   --dry-run              afficher ce qui serait fait, sans aucun appel à Claude
 *   --scheduled            mode tâche planifiée (optionnel, LaunchAgent) : fenêtre 22 h – 5 h, pas d'usage
 *                          de Bastien dans les 2 h, bilan le dimanche
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function option(name: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
}

async function main() {
  const { budgetFromEnv, canSpend, TASK_ESTIMATE } = await import("@/lib/bench/budget");
  const { automaticTokensSince, pendingTasks, runBench } = await import("@/lib/bench/runner");
  const { loadFixtures, logNightly } = await import("@/lib/bench/store");
  const { localDate } = await import("@/lib/dates");
  const { currentCoachModel } = await import("@/lib/coach");
  const { createUsageRepository } = await import("@/lib/db/repositories/usage-repository");
  const { getDashboard } = await import("@/lib/server/analytics");
  const { generateWeeklyReview, listWeeklyReviews } = await import("@/lib/server/coach-service");
  const { readRateLimits } = await import("@/lib/server/usage");
  const { defaultReviewWeek } = await import("@/lib/server/weekly-dossier");

  const scheduled = process.argv.includes("--scheduled");
  const dryRun = process.argv.includes("--dry-run");
  const only = option("only")?.split(",").filter(Boolean) ?? null;
  const now = new Date();
  const hour = now.getHours();
  const log = (line: string) => { console.log(line); if (!dryRun) logNightly(line); };

  if (scheduled) {
    // Mac endormi à 22 h : launchd relance au réveil ; hors 22 h – 5 h on saute la nuit pour ne pas prendre le quota du matin.
    if (hour >= 5 && hour < 22) return log(`hors fenêtre (${hour} h) : nuit sautée`);
    const recent = createUsageRepository().since(new Date(now.getTime() - 2 * 3_600_000).toISOString()).filter((row) => row.kind === "session" || row.kind === "outlook" || row.kind === "chat");
    if (recent.length) return log(`Bastien a utilisé le coach il y a moins de 2 h (${recent.length} appel(s)) : nuit sautée`);
  }

  const base = budgetFromEnv(process.env);
  const config = {
    nightTokens: Number(option("budget")) || base.nightTokens,
    weekTokens: Number(option("week-budget")) || base.weekTokens,
    maxUtilization: { ...base.maxUtilization, fiveHour: Number(option("max-five-hour")) || base.maxUtilization.fiveHour },
  };
  const startIso = now.toISOString();
  const windows = () => Object.values(readRateLimits()).map((window) => ({ window: window.window ?? "inconnue", utilization: window.utilization, resetsAt: window.resetsAt, status: window.status }));
  log(`début${scheduled ? " (planifié)" : " (manuel)"} : plafonds ${config.nightTokens} pour ce lancement, ${config.weekTokens} sur 7 jours (déjà ${automaticTokensSince(new Date(now.getTime() - 7 * 86_400_000).toISOString())}), arrêt si 5 h ≥ ${Math.round(config.maxUtilization.fiveHour * 100)} % ; modèle ${currentCoachModel()}`);

  const day = hour < 5 ? new Date(now.getTime() - 6 * 3_600_000) : now;
  if (process.argv.includes("--weekly") || (scheduled && day.getDay() === 0)) {
    const week = defaultReviewWeek(localDate(day));
    if (listWeeklyReviews(4).some((review) => review.weekStart === week)) log(`bilan de la semaine du ${week} déjà fait`);
    else {
      const decision = canSpend({ estimate: TASK_ESTIMATE.weekly, nightUsed: automaticTokensSince(startIso), weekUsed: automaticTokensSince(new Date(now.getTime() - 7 * 86_400_000).toISOString()), config, windows: windows(), now });
      if (!decision.ok) log(`bilan reporté : ${decision.reason}`);
      else if (dryRun) log(`(essai à blanc) bilan de la semaine du ${week}`);
      else {
        const result = await generateWeeklyReview(week, getDashboard().profile.zones);
        log(result.status === "ready" ? `bilan de la semaine du ${week} produit` : `bilan en échec : ${result.status === "error" ? result.message : result.status}`);
      }
    }
  }

  if (!loadFixtures().length) return log("banc : aucune séance figée (lancer scripts/bench-freeze.ts)");
  log(`banc : ${pendingTasks(currentCoachModel(), only).length} tâche(s) en attente`);
  const summary = await runBench(config, { nightStartIso: startIso, dryRun, only });
  log(`banc : ${summary.done.length} tâche(s) faite(s), ${summary.remaining} restante(s)${summary.stoppedBecause ? `, arrêt : ${summary.stoppedBecause}` : ""} ; ${summary.tokensUsed} tokens pour ce lancement`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
