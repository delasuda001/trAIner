import { randomUUID } from "node:crypto";
import { isSupportedRunningActivity } from "@/lib/activities/classification";
import type { AppDatabase } from "@/lib/db/client";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { fetchActivityList, parseActivityListItem } from "./client";
import { mapIntervalsActivityToSyncedActivityInsert } from "./mapper";

export type ActivitySyncPeriod = { weeks: number; oldest: string; newest: string };
export type ActivitySyncFailure = { activityId?: string; code: string; message: string };
export type ActivitySyncResult = { requestId: string; period: ActivitySyncPeriod; receivedCount: number; createdCount: number; updatedCount: number; unchangedCount: number; ignoredUnsupportedSportCount: number; invalidActivityCount: number; failedCount: number; failures: ActivitySyncFailure[]; syncedAt: string };

export function calculateSyncPeriod(weeks: number, now = new Date()): ActivitySyncPeriod {
  const newest = now.toISOString().slice(0, 10);
  const oldest = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { weeks, oldest, newest };
}

export async function synchronizeRunningActivities(options: { weeks: number; requestId?: string; database?: AppDatabase }): Promise<ActivitySyncResult> {
  const requestId = options.requestId ?? randomUUID();
  const syncedAt = new Date().toISOString();
  const period = calculateSyncPeriod(options.weeks);
  const repository = createSyncedActivityRepository(options.database);
  const payloads = await fetchActivityList({ requestId, oldest: period.oldest, newest: period.newest });
  const result: ActivitySyncResult = { requestId, period, receivedCount: payloads.length, createdCount: 0, updatedCount: 0, unchangedCount: 0, ignoredUnsupportedSportCount: 0, invalidActivityCount: 0, failedCount: 0, failures: [], syncedAt };
  for (const payload of payloads) {
    let activityId: string | undefined;
    try {
      const activity = parseActivityListItem(payload);
      activityId = activity.id;
      if (!isSupportedRunningActivity(activity)) { result.ignoredUnsupportedSportCount += 1; continue; }
      const outcome = await repository.upsertWithOutcome(mapIntervalsActivityToSyncedActivityInsert(activity, syncedAt));
      result[`${outcome.operation}Count`] += 1;
    } catch (error) {
      if (!activityId && typeof payload === "object" && payload !== null && "id" in payload && (typeof payload.id === "string" || typeof payload.id === "number")) activityId = String(payload.id);
      if (error instanceof Error && error.name === "ZodError") { result.invalidActivityCount += 1; result.failures.push({ activityId, code: "INVALID_ACTIVITY", message: "Activité ignorée : données invalides" }); }
      else { result.failedCount += 1; result.failures.push({ activityId, code: "DATABASE_ERROR", message: "Activité non synchronisée" }); }
    }
  }
  console.info("[sync] completed", { requestId, period, receivedCount: result.receivedCount, createdCount: result.createdCount, updatedCount: result.updatedCount, unchangedCount: result.unchangedCount, ignoredUnsupportedSportCount: result.ignoredUnsupportedSportCount, invalidActivityCount: result.invalidActivityCount, failedCount: result.failedCount });
  return result;
}