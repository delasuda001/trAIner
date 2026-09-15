import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client";
import { createStreamSummaryRepository } from "../db/repositories/stream-summary-repository";
import { createSyncedActivityRepository } from "../db/repositories/synced-activity-repository";
import { fetchActivityStreams } from "../intervals/stream-client";
import { normalizeActivityStreams } from "../intervals/stream-mapper";
import { IntervalsApiError } from "../intervals/client";
import { computeStreamSummary, STREAM_SUMMARY_VERSION } from "./stream-summary";
import { buildPerformanceProfile } from "./performance-profile";
import type { PerformanceProfile } from "../llm/schemas";

/** Plafond dur d'activités traitées par appel : garde l'opération bornée et séquentielle. */
export const MAX_ACTIVITIES_PER_RECALC = 40;

export type RecalcResult = {
  windowWeeks: number;
  consideredActivities: number;
  computedSummaries: number;
  alreadyFresh: number;
  failed: number;
  rateLimited: boolean;
  retryAfter?: string;
  profile: PerformanceProfile;
};

/**
 * Recalcule les résumés de streams manquants (version courante) sur une fenêtre
 * bornée, séquentiellement. Sur une réponse 429 d'Intervals.icu, l'opération
 * s'arrête et remonte `Retry-After` — aucune relance agressive. Déclenchement
 * explicite uniquement (jamais de tâche de fond).
 */
export async function recalculatePerformanceProfile(options: {
  database: AppDatabase;
  weeks: number;
  requestId?: string;
  now?: Date;
  fetchStreams?: typeof fetchActivityStreams;
}): Promise<RecalcResult> {
  const { database, weeks } = options;
  const requestId = options.requestId ?? randomUUID();
  const now = options.now ?? new Date();
  const fetchStreams = options.fetchStreams ?? fetchActivityStreams;

  const syncedRepo = createSyncedActivityRepository(database);
  const streamSummaryRepo = createStreamSummaryRepository(database);

  const start = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
  const runs = await syncedRepo.findByPeriod(start, now.toISOString(), MAX_ACTIVITIES_PER_RECALC);

  let computedSummaries = 0;
  let alreadyFresh = 0;
  let failed = 0;
  let rateLimited = false;
  let retryAfter: string | undefined;

  for (const run of runs) {
    const existing = await streamSummaryRepo.findByActivityAndVersion(run.intervalsActivityId, STREAM_SUMMARY_VERSION);
    if (existing) {
      alreadyFresh += 1;
      continue;
    }

    try {
      const raw = await fetchStreams(run.intervalsActivityId, { requestId, activityId: run.intervalsActivityId });
      const normalized = normalizeActivityStreams(run.intervalsActivityId, raw);
      const summary = computeStreamSummary(normalized);
      const timestamp = new Date().toISOString();
      await streamSummaryRepo.upsert({
        id: randomUUID(),
        intervalsActivityId: run.intervalsActivityId,
        streamVersion: STREAM_SUMMARY_VERSION,
        summaryJson: JSON.stringify(summary),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      computedSummaries += 1;
    } catch (error) {
      if (error instanceof IntervalsApiError && error.status === 429) {
        rateLimited = true;
        retryAfter = error.retryAfter;
        break;
      }
      failed += 1;
      console.error("[performance-profile] stream summary recalc failed", { requestId, activityId: run.intervalsActivityId, message: error instanceof Error ? error.message : "unknown" });
    }
  }

  const profile = await buildPerformanceProfile(database);

  return {
    windowWeeks: weeks,
    consideredActivities: runs.length,
    computedSummaries,
    alreadyFresh,
    failed,
    rateLimited,
    retryAfter,
    profile,
  };
}
