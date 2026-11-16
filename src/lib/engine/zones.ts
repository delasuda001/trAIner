import type { HeartRateZones } from "@/lib/source/types";

export type ZoneIndex = 1 | 2 | 3 | 4 | 5;

export const ZONE_LABELS: Record<ZoneIndex, string> = {
  1: "Z1 récupération",
  2: "Z2 endurance",
  3: "Z3 tempo",
  4: "Z4 seuil",
  5: "Z5 VO2max",
};

/** Zones par défaut (% FC max) si la montre n'a pas fourni les siennes. */
export function fallbackZones(maxHeartRateBpm: number): HeartRateZones {
  const floors = [0.5, 0.68, 0.79, 0.85, 0.9].map((share) => Math.round(share * maxHeartRateBpm)) as HeartRateZones["floors"];
  return { floors, maxHeartRateBpm, lactateThresholdHeartRateBpm: null, method: "PERCENT_MAX_HR_DEFAULT" };
}

export function zoneOf(heartRate: number, zones: HeartRateZones): ZoneIndex | 0 {
  const { floors } = zones;
  if (heartRate >= floors[4]) return 5;
  if (heartRate >= floors[3]) return 4;
  if (heartRate >= floors[2]) return 3;
  if (heartRate >= floors[1]) return 2;
  if (heartRate >= floors[0]) return 1;
  return 0;
}

/** Plage de FC [bas, haut] d'une zone (haut = plancher de la suivante − 1). */
export function zoneRange(zone: ZoneIndex, zones: HeartRateZones): [number, number] {
  const low = zones.floors[zone - 1];
  const high = zone === 5 ? (zones.maxHeartRateBpm ?? low + 15) : zones.floors[zone] - 1;
  return [low, high];
}
