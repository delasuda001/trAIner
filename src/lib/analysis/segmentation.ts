import type { Lap } from "@/lib/intervals/schemas";
import type { ActivitySegment, SegmentationInput, SegmentationResult, SegmentationStrategy } from "./types";

export type { SegmentationStrategy } from "./types";

export function segmentActivity(input: SegmentationInput, strategy: SegmentationStrategy): SegmentationResult {
  const laps = input.laps.length > 0 ? input.laps : [syntheticLap(input.streams)];
  const segments = laps.flatMap((lap, lapIndex) => splitLap(lap, lapIndex, strategy));
  return { strategy, segments, limitations: input.laps.length > 0 ? [] : ["Aucun intervalle fourni : activité traitée comme un lap synthétique"] };
}

function splitLap(lap: Lap, lapIndex: number, strategy: SegmentationStrategy): ActivitySegment[] {
  const duration = lap.moving_time ?? lap.elapsed_time;
  const distance = lap.distance;
  const count = strategy === "lap" ? 1 : strategy === "thirds" ? 3 : adaptiveCount(distance, duration);
  const safeCount = duration != null ? Math.max(1, Math.min(count, Math.floor(duration / 90) || 1)) : Math.min(count, 8);
  return Array.from({ length: safeCount }, (_, index) => {
    const start = duration == null ? 0 : Math.round((duration * index) / safeCount);
    const end = duration == null ? 0 : Math.round((duration * (index + 1)) / safeCount);
    const segmentDistance = distance == null ? null : distance / safeCount;
    const limitations = duration == null ? ["Durée indisponible"] : [];
    if (safeCount !== count) limitations.push("Découpage réduit pour respecter 90 secondes minimum");
    return { lapId: String(lap.id ?? `synthetic-${lapIndex}`), index, startElapsedTimeS: start, endElapsedTimeS: end, durationS: end - start, distanceM: segmentDistance, averageSpeedMps: lap.average_speed ?? null, medianSpeedMps: lap.average_speed ?? null, averageHeartRateBpm: lap.average_heartrate ?? null, averageCadenceSpm: lap.average_cadence ?? null, averageAltitudeM: null, altitudeVariationM: null, averagePowerW: null, availability: { speed: lap.average_speed != null, heartRate: lap.average_heartrate != null, cadence: lap.average_cadence != null, altitude: false, power: false }, limitations };
  });
}

function adaptiveCount(distance: number | null | undefined, duration: number | null | undefined): number { if (distance != null) { if (distance < 600) return 1; if (distance < 3000) return 3; if (distance < 6000) return 4; if (distance < 10000) return 6; return Math.min(8, Math.max(1, Math.ceil(distance / 1000))); } return duration != null ? Math.min(8, Math.max(1, Math.ceil(duration / 600))) : 1; }
function syntheticLap(streams: SegmentationInput["streams"]): Lap { const duration = streams?.elapsedTimeS.at(-1) ?? null; const distance = streams?.distanceM?.at(-1) ?? null; return { id: "synthetic-activity", name: "Activité entière", distance, elapsed_time: duration, moving_time: duration, average_speed: streams?.speedMps ? averageNullable(streams.speedMps) : null, average_heartrate: streams?.heartRateBpm ? averageNullable(streams.heartRateBpm) : null, average_cadence: streams?.cadenceSpm ? averageNullable(streams.cadenceSpm) : null }; }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function averageNullable(values: Array<number | null>): number | null { const present = values.filter((value): value is number => value != null); return present.length ? average(present) : null; }