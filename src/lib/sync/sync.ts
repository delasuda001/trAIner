import { z } from "zod";
import { addDays, localDate } from "@/lib/dates";
import type { ActivitySummary, AthleteProfile, DataSource, Sport } from "@/lib/source/types";
import type { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import type { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import type { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";

/** Sports dont on télécharge les séries détaillées à la synchronisation (les autres : à la demande). */
export const DETAILED_SPORTS: ReadonlySet<Sport> = new Set(["running", "trail_running", "treadmill_running"]);
/** Recouvrement à chaque synchro incrémentale, pour récupérer les modifications récentes. */
const OVERLAP_DAYS = 3;
const WELLNESS_BACKFILL_DAYS = 400;
const DETAIL_CONCURRENCY = 3;

export const PROFILE_KEY = "athlete_profile";
export const DETAIL_SCHEMA_KEY = "detail_schema_version";
/** v2 : dynamique de course (GCT, oscillation, ratio vertical, longueur de pas) lue dans le FIT. */
export const DETAIL_SCHEMA_VERSION = 2;
/** Les montres avec dynamique de course datent de mai 2025 : inutile de retélécharger avant. */
const DYNAMICS_REFETCH_SINCE = "2025-04-01T00:00:00Z";
export const SYNC_STATE_KEY = "sync_state";

export const athleteProfileSchema = z.object({
  heartRateZones: z.object({
    floors: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
    maxHeartRateBpm: z.number().nullable(),
    lactateThresholdHeartRateBpm: z.number().nullable(),
    method: z.string().nullable(),
  }).nullable(),
  lactateThresholdSpeedMps: z.number().nullable(),
});

export const syncStateSchema = z.object({
  lastSuccessAt: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export type SyncState = z.infer<typeof syncStateSchema>;

export type SyncDependencies = {
  source: DataSource;
  activities: ReturnType<typeof createActivityRepository>;
  wellness: ReturnType<typeof createWellnessRepository>;
  state: ReturnType<typeof createAppStateRepository>;
  now?: () => Date;
};

export type SyncResult = {
  newActivityIds: string[];
  /** Nouvelles courses, plus récentes d'abord. */
  newRunIds: string[];
  updatedActivities: number;
  detailsFetched: number;
  detailsFailed: number;
  pendingDetails: number;
  wellnessDays: number;
  totalActivities: number;
};

export function initialDetailStatus(summary: ActivitySummary): "pending" | "skipped" {
  return DETAILED_SPORTS.has(summary.sport) ? "pending" : "skipped";
}

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Synchronisation incrémentale : résumés d'activités, séries détaillées
 * (dans la limite de `detailBudget` par appel, pour garder chaque appel court),
 * bien-être et profil. Rejouable sans effet de bord : tout est en upsert.
 */
export type SyncOptions = {
  detailBudget: number;
  /** Première synchro : ne remonter que depuis cette date (invités à gros volume) ; null = tout l'historique. */
  historyStart?: Date | null;
  /** Profondeur du premier import de bien-être, en jours. */
  wellnessBackfillDays?: number;
};

export async function runSync(deps: SyncDependencies, options: SyncOptions): Promise<SyncResult> {
  const now = deps.now?.() ?? new Date();
  const source = deps.source.name;
  const previous = deps.state.get(SYNC_STATE_KEY, syncStateSchema) ?? { lastSuccessAt: null, lastAttemptAt: null, lastError: null };
  deps.state.set(SYNC_STATE_KEY, { ...previous, lastAttemptAt: now.toISOString() });

  try {
    const schema = deps.state.get(DETAIL_SCHEMA_KEY, z.number()) ?? 1;
    if (schema < DETAIL_SCHEMA_VERSION) {
      deps.activities.requeueDetails([...DETAILED_SPORTS], DYNAMICS_REFETCH_SINCE);
      deps.state.set(DETAIL_SCHEMA_KEY, DETAIL_SCHEMA_VERSION);
    }
    const latest = deps.activities.latestStart(source);
    const since = latest ? new Date(Date.parse(latest) - OVERLAP_DAYS * 86_400_000) : (options.historyStart ?? null);
    const summaries = await deps.source.listActivities(since);
    const { inserted } = deps.activities.upsertSummaries(source, summaries, initialDetailStatus, now.toISOString());

    let detailsFetched = 0;
    let detailsFailed = 0;
    const pending = deps.activities.findPendingDetails(options.detailBudget);
    await mapWithConcurrency(pending, DETAIL_CONCURRENCY, async (row) => {
      try {
        const detail = await deps.source.getActivityDetail(row.sourceId, row.sourceType);
        deps.activities.saveDetail(row.id, detail);
        detailsFetched += 1;
      } catch {
        deps.activities.setDetailStatus(row.id, "failed");
        detailsFailed += 1;
      }
    });

    const today = localDate(now);
    const latestWellness = deps.wellness.latestDate();
    const wellnessStart = latestWellness ? addDays(latestWellness, -OVERLAP_DAYS) : addDays(today, -(options.wellnessBackfillDays ?? WELLNESS_BACKFILL_DAYS));
    const days = await deps.source.getWellness(wellnessStart, today);
    deps.wellness.upsert(days, now.toISOString());

    const latestRun = summaries.find((summary) => DETAILED_SPORTS.has(summary.sport)) ?? null;
    const profile: AthleteProfile = await deps.source.getAthleteProfile(latestRun?.sourceId);
    const previousProfile = deps.state.get(PROFILE_KEY, athleteProfileSchema);
    deps.state.set(PROFILE_KEY, {
      heartRateZones: profile.heartRateZones ?? previousProfile?.heartRateZones ?? null,
      lactateThresholdSpeedMps: profile.lactateThresholdSpeedMps ?? previousProfile?.lactateThresholdSpeedMps ?? null,
    });

    deps.state.set(SYNC_STATE_KEY, { lastSuccessAt: now.toISOString(), lastAttemptAt: now.toISOString(), lastError: null });
    const insertedSet = new Set(inserted);
    const newRunIds = summaries.filter((summary) => DETAILED_SPORTS.has(summary.sport)).map((summary) => `${source}:${summary.sourceId}`).filter((id) => insertedSet.has(id));
    return {
      newActivityIds: inserted,
      newRunIds,
      updatedActivities: summaries.length - inserted.length,
      detailsFetched,
      detailsFailed,
      pendingDetails: deps.activities.countPendingDetails(),
      wellnessDays: days.length,
      totalActivities: deps.activities.count(),
    };
  } catch (error) {
    deps.state.set(SYNC_STATE_KEY, { ...previous, lastAttemptAt: now.toISOString(), lastError: (error as Error).message });
    throw error;
  }
}
