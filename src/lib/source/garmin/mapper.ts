import type { ActivitySummary, Sport } from "../types";
import type { GarminActivityListItem } from "./schemas";

const SPORT_BY_TYPE: Record<string, Sport> = {
  running: "running",
  street_running: "running",
  track_running: "running",
  trail_running: "trail_running",
  treadmill_running: "treadmill_running",
  indoor_running: "treadmill_running",
  cycling: "cycling",
  road_biking: "cycling",
  mountain_biking: "cycling",
  gravel_cycling: "cycling",
  indoor_cycling: "cycling",
  virtual_ride: "cycling",
  lap_swimming: "swimming",
  open_water_swimming: "swimming",
  hiking: "hiking",
  walking: "walking",
  strength_training: "strength",
  backcountry_skiing: "ski_touring",
  surfing: "surfing",
  surfing_v2: "surfing",
};

export function mapGarminSport(typeKey: string): Sport {
  return SPORT_BY_TYPE[typeKey] ?? "other";
}

/** "2026-11-13 18:01:11" (GMT) → ISO UTC. */
export function garminGmtToIso(value: string): string {
  return `${value.replace(" ", "T")}Z`.replace(/\.\d+Z$/, "Z");
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function mapGarminActivity(item: GarminActivityListItem): ActivitySummary {
  const zones = [item.hrTimeInZone_1, item.hrTimeInZone_2, item.hrTimeInZone_3, item.hrTimeInZone_4, item.hrTimeInZone_5];
  const hasZones = zones.some((value) => value != null);
  const temperature = item.minTemperature != null && item.maxTemperature != null ? (item.minTemperature + item.maxTemperature) / 2 : null;
  return {
    sourceId: String(item.activityId),
    name: item.activityName?.trim() || "Activité",
    sport: mapGarminSport(item.activityType.typeKey),
    sourceType: item.activityType.typeKey,
    startTimeUtc: garminGmtToIso(item.startTimeGMT),
    startTimeLocal: item.startTimeLocal.replace(" ", "T"),
    distanceM: positive(item.distance),
    movingTimeS: positive(item.movingDuration ?? item.duration),
    elapsedTimeS: positive(item.elapsedDuration ?? item.duration),
    elevationGainM: item.elevationGain ?? null,
    averageSpeedMps: positive(item.averageSpeed),
    averageHeartRateBpm: positive(item.averageHR),
    maxHeartRateBpm: positive(item.maxHR),
    // Garmin fournit déjà la cadence en pas/min (deux jambes) dans ce champ.
    averageCadenceSpm: positive(item.averageRunningCadenceInStepsPerMinute),
    trainingLoad: item.activityTrainingLoad ?? null,
    aerobicTrainingEffect: item.aerobicTrainingEffect ?? null,
    anaerobicTrainingEffect: item.anaerobicTrainingEffect ?? null,
    trainingEffectLabel: item.trainingEffectLabel ?? null,
    hrTimeInZonesS: hasZones ? (zones.map((value) => Math.round(value ?? 0)) as [number, number, number, number, number]) : null,
    averageTemperatureC: temperature,
    lapCount: item.lapCount ?? null,
  };
}
