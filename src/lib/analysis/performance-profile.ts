import { desc } from "drizzle-orm";
import type { AppDatabase } from "../db/client";
import { analyses, syncedActivities } from "../db/schema";
import { createSyncedActivityRepository } from "../db/repositories/synced-activity-repository";
import { estimateThreshold } from "./thresholds";
import { aggregateCachedEfforts, toThresholdInput, type CachedThresholdBasis } from "./threshold-basis";
import { buildThresholdStaleMessage } from "./confidence-banner";
import { activityAnalysisResponseSchema, performanceProfileSchema, type PerformanceProfile } from "../llm/schemas";

const VOLUME_WEEKS = 12;
const RECENT_ANALYSES_FOR_TAKEAWAYS = 5;
const MAX_KEY_TAKEAWAYS = 6;
/**
 * Nombre d'analyses (les plus récentes) lues pour en dédupliquer
 * `RECENT_ANALYSES_FOR_TAKEAWAYS` activités distinctes. Borne la lecture des
 * blobs `llm_response_json` : il faudrait régénérer une même analyse ~4 fois
 * en série pour rater une activité distincte au-delà de cette fenêtre.
 */
const RECENT_ANALYSES_SCAN_LIMIT = 20;

/**
 * Profil de performance multi-activités, calculé à la demande.
 *
 * Agrège : les résumés de streams en cache (meilleur effort par durée de
 * référence, dans la fenêtre `ESTIMATE_WINDOW_WEEKS`, toutes activités
 * confondues) -> estimation de seuil ; la tendance de volume de course sur
 * 12 semaines ; les key_takeaways des débriefs récents. `manual_sessions`
 * n'est jamais lue. Aucun score de charge/fatigue.
 *
 * `precomputedBasis` : quand l'appelant (le débrief d'activité) a déjà agrégé
 * les efforts pour sa propre estimation de seuil, il le passe ici pour éviter
 * de refaire le même calcul dans la même requête.
 */
export async function buildPerformanceProfile(
  database: AppDatabase,
  now: Date = new Date(),
  precomputedBasis?: CachedThresholdBasis
): Promise<PerformanceProfile> {
  const syncedRepo = createSyncedActivityRepository(database);

  const basis = precomputedBasis ?? (await aggregateCachedEfforts(database, now));
  const allRuns = await database.select().from(syncedActivities);
  const threshold = estimateThreshold(toThresholdInput(basis));

  const rejectionByDuration = new Map(threshold.rejectedPoints.map((point) => [point.durationS, point.reason]));
  const bestEfforts = basis.efforts.map((effort) => {
    const rejectionReason = rejectionByDuration.get(effort.durationS) ?? null;
    return {
      durationS: effort.durationS,
      paceMinKm: paceMinKm(effort.speedMps) ?? "—",
      meanHeartRateBpm: effort.meanHeartRateBpm,
      activityId: effort.activityId,
      activityDate: effort.activityDateIso,
      status: rejectionReason ? ("rejected" as const) : ("used" as const),
      rejectionReason,
    };
  });

  const weeklyVolume = await buildWeeklyVolume(syncedRepo, now);
  const recentKeyTakeaways = await buildRecentKeyTakeaways(database);

  const profile = {
    generatedAt: now.toISOString(),
    estimateWindowWeeks: basis.windowWeeks,
    thresholdPaceMinKm: paceMinKm(threshold.criticalSpeedMps),
    thresholdConfidence: threshold.confidenceLevel,
    thresholdBiasHint: threshold.biasIndicator,
    thresholdFreshnessStale: threshold.freshnessAlert,
    thresholdStalePointCount: threshold.stalePointCount,
    thresholdOldestRetainedPointWeeks: threshold.oldestRetainedPointWeeks,
    thresholdStaleMessage: buildThresholdStaleMessage({
      validPointCount: threshold.validPointCount,
      stalePointCount: threshold.stalePointCount,
      oldestRetainedPointWeeks: threshold.oldestRetainedPointWeeks,
      windowWeeks: basis.windowWeeks,
    }),
    missingDurationZones: threshold.missingZones,
    bestEfforts,
    weeklyVolume,
    recentKeyTakeaways,
    activitiesWithStreamSummary: basis.activitiesWithSummaryTotal,
    activitiesWithStreamSummaryInWindow: basis.activitiesWithSummaryInWindow,
    totalRunningActivities: allRuns.length,
  };

  return performanceProfileSchema.parse(profile);
}

async function buildWeeklyVolume(
  syncedRepo: ReturnType<typeof createSyncedActivityRepository>,
  now: Date
): Promise<PerformanceProfile["weeklyVolume"]> {
  const start = new Date(now.getTime() - VOLUME_WEEKS * 7 * 24 * 60 * 60 * 1000).toISOString();
  const runs = await syncedRepo.findByPeriod(start, now.toISOString());

  const kmByWeek = new Map<number, number>();
  for (const run of runs) {
    if (run.distanceM == null) continue;
    const weekIndex = Math.floor((now.getTime() - new Date(run.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000));
    kmByWeek.set(weekIndex, (kmByWeek.get(weekIndex) ?? 0) + run.distanceM / 1000);
  }

  const weekKm = (index: number) => kmByWeek.get(index) ?? 0;
  const recentAverageKm = average([0, 1, 2, 3].map(weekKm));
  const priorAverageKm = average([4, 5, 6, 7].map(weekKm));
  const hasData = runs.length > 0;

  let trend: string | null = null;
  if (hasData && priorAverageKm > 0) {
    const deltaPct = ((recentAverageKm - priorAverageKm) / priorAverageKm) * 100;
    const sign = deltaPct > 0 ? "+" : "";
    trend = `${sign}${Math.round(deltaPct)} % vs 4 semaines précédentes`;
  }

  return {
    recentAverageKm: hasData ? Number(recentAverageKm.toFixed(1)) : null,
    priorAverageKm: hasData ? Number(priorAverageKm.toFixed(1)) : null,
    trend,
  };
}

async function buildRecentKeyTakeaways(database: AppDatabase): Promise<string[]> {
  const rows = await database
    .select({ intervalsActivityId: analyses.intervalsActivityId, llmResponseJson: analyses.llmResponseJson })
    .from(analyses)
    .orderBy(desc(analyses.createdAt))
    .limit(RECENT_ANALYSES_SCAN_LIMIT);

  // Une seule analyse par activité (la plus récente, l'ordre SQL étant décroissant),
  // AVANT de sélectionner les N dernières au global : une analyse régénérée ne
  // doit pas produire de doublons quasi identiques.
  const seenActivities = new Set<string>();
  const latestPerActivity: string[] = [];
  for (const row of rows) {
    if (seenActivities.has(row.intervalsActivityId)) continue;
    seenActivities.add(row.intervalsActivityId);
    latestPerActivity.push(row.llmResponseJson);
    if (latestPerActivity.length >= RECENT_ANALYSES_FOR_TAKEAWAYS) break;
  }

  const takeaways: string[] = [];
  for (const llmResponseJson of latestPerActivity) {
    const parsed = activityAnalysisResponseSchema.safeParse(safeJsonParse(llmResponseJson));
    if (!parsed.success) continue;
    for (const takeaway of parsed.data.key_takeaways) {
      if (!takeaways.includes(takeaway)) takeaways.push(takeaway);
    }
  }
  return takeaways.slice(0, MAX_KEY_TAKEAWAYS);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** m/s -> "m:ss" (allure au km), ou null si vitesse non exploitable. */
function paceMinKm(speedMps: number | null): string | null {
  if (speedMps == null || speedMps <= 0) return null;
  const secPerKm = Math.round(1000 / speedMps);
  return `${Math.floor(secPerKm / 60)}:${(secPerKm % 60).toString().padStart(2, "0")}`;
}
