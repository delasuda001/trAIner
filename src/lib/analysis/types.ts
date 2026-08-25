import type { NormalizedStreams } from "@/lib/db/contracts";
import type { Lap } from "@/lib/intervals/schemas";

export type SegmentationStrategy = "lap" | "thirds" | "adaptive";
export type SegmentAvailability = { speed: boolean; heartRate: boolean; cadence: boolean; altitude: boolean; power: boolean };
export type ActivitySegment = { lapId: string; index: number; startElapsedTimeS: number; endElapsedTimeS: number; durationS: number; distanceM: number | null; averageSpeedMps: number | null; medianSpeedMps: number | null; averageHeartRateBpm: number | null; averageCadenceSpm: number | null; averageAltitudeM: number | null; altitudeVariationM: number | null; averagePowerW: number | null; availability: SegmentAvailability; limitations: string[] };
export type SegmentationResult = { strategy: SegmentationStrategy; segments: ActivitySegment[]; limitations: string[] };
export type SegmentationInput = { laps: Lap[]; streams?: NormalizedStreams };