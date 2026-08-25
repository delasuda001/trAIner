import type { NewSyncedActivity } from "@/lib/db/types";
import type { ActivityListItem } from "./schemas";

export function mapIntervalsActivityToSyncedActivityInsert(activity: ActivityListItem, syncedAt: string): NewSyncedActivity {
  return {
    id: `intervals:${activity.id}`,
    intervalsActivityId: String(activity.id),
    startDate: new Date(activity.start_date).toISOString(),
    timezone: activity.timezone ?? null,
    name: activity.name ?? null,
    sportType: "Run",
    distanceM: activity.distance ?? null,
    movingTimeS: activity.moving_time ?? null,
    elapsedTimeS: activity.elapsed_time ?? null,
    elevationGainM: activity.total_elevation_gain ?? null,
    averageSpeedMps: activity.average_speed ?? null,
    averageHeartRateBpm: activity.average_heartrate ?? null,
    maxHeartRateBpm: activity.max_heartrate ?? null,
    averageCadenceSpm: activity.average_cadence ?? null,
    averagePowerW: activity.icu_average_watts ?? null,
    trainingLoad: activity.icu_training_load ?? null,
    sourceUpdatedAt: activity.icu_sync_date ? new Date(activity.icu_sync_date).toISOString() : null,
    syncedAt,
    createdAt: syncedAt,
    updatedAt: syncedAt,
  };
}