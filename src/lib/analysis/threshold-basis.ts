import type { AppDatabase } from "../db/client";
import { syncedActivities } from "../db/schema";
import { createStreamSummaryRepository } from "../db/repositories/stream-summary-repository";
import { STREAM_SUMMARY_VERSION, REFERENCE_EFFORT_DURATIONS_S, streamSummaryPayloadSchema } from "./stream-summary";
import type { ThresholdInput } from "./thresholds";

/**
 * Fenêtre temporelle d'agrégation des meilleurs efforts pour l'estimation
 * ACTIVE de seuil (~5 mois), cohérente avec les scripts de validation manuelle
 * antérieurs. Les résumés de streams plus anciens restent en cache mais ne
 * participent pas à l'estimation courante (cf. `docs/22`). C'est plus large
 * que la fenêtre de fraîcheur de 8 semaines de `thresholds.ts` : des points
 * de 8 à 20 semaines alimentent l'estimation tout en déclenchant
 * `freshnessAlert`.
 */
export const ESTIMATE_WINDOW_WEEKS = 20;

export type AggregatedEffort = {
  durationS: number;
  speedMps: number;
  meanHeartRateBpm: number | null;
  activityId: string;
  activityDateIso: string;
};

export type CachedThresholdBasis = {
  windowWeeks: number;
  windowStartIso: string;
  /** Meilleur effort par durée de référence, dans la fenêtre, toutes activités confondues. */
  efforts: AggregatedEffort[];
  globalMaxHeartRateBpm: number | null;
  activitiesWithSummaryInWindow: number;
  activitiesWithSummaryTotal: number;
};

/**
 * Agrège, depuis `activity_stream_summaries` (version courante uniquement) et
 * dans la fenêtre `ESTIMATE_WINDOW_WEEKS`, le meilleur effort par durée de
 * référence. Ne déclenche AUCUN fetch de streams : utilise strictement le
 * cache existant.
 */
export async function aggregateCachedEfforts(database: AppDatabase, now: Date = new Date()): Promise<CachedThresholdBasis> {
  const windowStartMs = now.getTime() - ESTIMATE_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;
  const windowStartIso = new Date(windowStartMs).toISOString();

  const summaries = await createStreamSummaryRepository(database).listByVersion(STREAM_SUMMARY_VERSION);
  const runs = await database.select().from(syncedActivities);
  const runByExternalId = new Map(runs.map((run) => [run.intervalsActivityId, run]));

  const globalMaxHeartRateBpm = runs.reduce<number | null>((max, run) => {
    const value = run.maxHeartRateBpm;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(max ?? 0, value) : max;
  }, null);

  const bestByDuration = new Map<number, AggregatedEffort>();
  const activitiesInWindow = new Set<string>();

  for (const row of summaries) {
    const run = runByExternalId.get(row.intervalsActivityId);
    if (!run) continue;
    const activityMs = new Date(run.startDate).getTime();
    if (!Number.isFinite(activityMs) || activityMs < windowStartMs) continue; // hors fenêtre -> exclu de l'estimation active

    const parsed = streamSummaryPayloadSchema.safeParse(safeJsonParse(row.summaryJson));
    if (!parsed.success) continue;

    activitiesInWindow.add(row.intervalsActivityId);
    for (const effort of parsed.data.bestEfforts) {
      const current = bestByDuration.get(effort.durationS);
      if (!current || effort.speedMps > current.speedMps) {
        bestByDuration.set(effort.durationS, {
          durationS: effort.durationS,
          speedMps: effort.speedMps,
          meanHeartRateBpm: effort.meanHeartRateBpm,
          activityId: row.intervalsActivityId,
          activityDateIso: run.startDate,
        });
      }
    }
  }

  const efforts = REFERENCE_EFFORT_DURATIONS_S.flatMap((durationS) => {
    const effort = bestByDuration.get(durationS);
    return effort ? [effort] : [];
  });

  return {
    windowWeeks: ESTIMATE_WINDOW_WEEKS,
    windowStartIso,
    efforts,
    globalMaxHeartRateBpm,
    activitiesWithSummaryInWindow: activitiesInWindow.size,
    activitiesWithSummaryTotal: new Set(summaries.map((row) => row.intervalsActivityId)).size,
  };
}

/** Convertit la base agrégée en entrée pour `estimateThreshold`. */
export function toThresholdInput(basis: CachedThresholdBasis): ThresholdInput {
  return {
    effortsByDuration: basis.efforts.map((effort) => ({
      durationS: effort.durationS,
      distanceM: effort.speedMps * effort.durationS,
      heartRateBpm: effort.meanHeartRateBpm,
      activityId: effort.activityId,
      dateS: Math.floor(new Date(effort.activityDateIso).getTime() / 1000),
    })),
    globalMaxHeartRateBpm: basis.globalMaxHeartRateBpm,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
