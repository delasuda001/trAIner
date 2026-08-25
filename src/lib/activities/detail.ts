import { randomUUID } from "node:crypto";
import { cachedActivityDetailSchema, cachedIntervalsSchema, parseJson, serializeJson } from "@/lib/db/contracts";
import { createActivityDetailCacheRepository } from "@/lib/db/repositories/activity-detail-cache-repository";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { getActivity } from "@/lib/intervals/client";
import type { AppDatabase } from "@/lib/db/client";

export const DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export type DetailCacheStatus = "fresh" | "refreshed" | "stale";
export type ActivityDetailResponse = { activity: unknown; intervals: unknown[]; dataAvailability: { intervals: boolean }; sourceMetadata: { cacheStatus: DetailCacheStatus; fetchedAt: string; sourceUpdatedAt: string | null } };

export async function loadActivityDetail(id: string, requestId: string, database: AppDatabase): Promise<ActivityDetailResponse> {
  const catalog = await createSyncedActivityRepository(database).findByExternalId(id);
  if (!catalog) throw new DetailNotFoundError();
  const cacheRepository = createActivityDetailCacheRepository(database);
  const cached = await cacheRepository.findByActivityId(id).catch(() => undefined);
  let staleValue: { activity: unknown; intervals: unknown[] } | undefined;
  if (cached) {
    try {
      const activity = parseJson(cachedActivityDetailSchema, cached.detailJson);
      const intervals = cached.intervalsJson ? parseJson(cachedIntervalsSchema, cached.intervalsJson).intervals : [];
      staleValue = { activity, intervals };
      if (Date.now() - Date.parse(cached.fetchedAt) < DETAIL_CACHE_TTL_MS) return { activity, intervals, dataAvailability: { intervals: intervals.length > 0 }, sourceMetadata: { cacheStatus: "fresh", fetchedAt: cached.fetchedAt, sourceUpdatedAt: cached.sourceUpdatedAt } };
    } catch { /* invalid cache is replaced below */ }
  }
  const fetchedAt = new Date().toISOString();
  let fetched: Awaited<ReturnType<typeof getActivity>>;
  try { fetched = await getActivity(id, requestId); }
  catch (error) {
    if (staleValue && error instanceof Error) return { ...staleValue, dataAvailability: { intervals: staleValue.intervals.length > 0 }, sourceMetadata: { cacheStatus: "stale", fetchedAt: cached?.fetchedAt ?? "", sourceUpdatedAt: catalog.sourceUpdatedAt } };
    throw error;
  }
  const detailJson = serializeJson(cachedActivityDetailSchema, fetched.activity);
  const intervalsJson = serializeJson(cachedIntervalsSchema, { intervals: fetched.laps });
  try { await cacheRepository.upsert({ id: cached?.id ?? randomUUID(), intervalsActivityId: id, detailJson, intervalsJson, sourceUpdatedAt: catalog.sourceUpdatedAt, fetchedAt, createdAt: cached?.createdAt ?? fetchedAt, updatedAt: fetchedAt }); } catch { /* cache failures must not hide a valid source response */ }
  return { activity: fetched.activity, intervals: fetched.laps, dataAvailability: { intervals: fetched.laps.length > 0 }, sourceMetadata: { cacheStatus: "refreshed", fetchedAt, sourceUpdatedAt: catalog.sourceUpdatedAt } };
}

export class DetailNotFoundError extends Error { constructor() { super("Activité locale introuvable"); this.name = "DetailNotFoundError"; } }