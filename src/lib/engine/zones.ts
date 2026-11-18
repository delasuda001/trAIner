import { daysBetween } from "@/lib/dates";
import type { HeartRateZones } from "@/lib/source/types";

export type ZoneIndex = 1 | 2 | 3 | 4 | 5;

export const ZONE_LABELS: Record<ZoneIndex, string> = {
  1: "Z1 récupération",
  2: "Z2 endurance",
  3: "Z3 tempo",
  4: "Z4 seuil",
  5: "Z5 VO2max",
};

const MAX_HR_SHARES = [0.5, 0.68, 0.79, 0.85, 0.9];

/** Zones en % de FC max (planchers Z1 à Z5). */
function percentOfMax(maxHeartRateBpm: number, method: string): HeartRateZones {
  const floors = MAX_HR_SHARES.map((share) => Math.round(share * maxHeartRateBpm)) as HeartRateZones["floors"];
  return { floors, maxHeartRateBpm, lactateThresholdHeartRateBpm: null, method };
}

/** Zones provisoires, seulement quand aucune course avec FC n'existe encore (rien à analyser). */
export function fallbackZones(maxHeartRateBpm: number): HeartRateZones {
  return percentOfMax(maxHeartRateBpm, "PERCENT_MAX_HR_DEFAULT");
}

export const HISTORY_ZONES_METHOD = "OBSERVED_MAX_HR";
const HISTORY_WINDOW_DAYS = 730;
const MIN_RUNS_WITH_HR = 5;

/**
 * Zones déduites des courses quand la montre n'a pas fourni les siennes : FC max
 * observée sur 2 ans, prise comme la 3e valeur la plus haute (un ou deux pics de
 * capteur ne la faussent pas), puis zones en % de cette FC max.
 * Chaque profil a donc les siennes ; jamais de valeur fixe.
 */
export function zonesFromHistory(runs: Array<{ localDate: string; maxHeartRateBpm: number | null }>, today: string): HeartRateZones | null {
  const values = runs
    .filter((run) => run.localDate <= today && daysBetween(run.localDate, today) <= HISTORY_WINDOW_DAYS)
    .map((run) => run.maxHeartRateBpm)
    .filter((value): value is number => value != null && value >= 120 && value <= 220)
    .sort((a, b) => b - a);
  if (values.length < MIN_RUNS_WITH_HR) return null;
  return percentOfMax(Math.round(values[2]), HISTORY_ZONES_METHOD);
}

export type ZonesSource = "watch" | "history" | "default";

/** D'où viennent les zones, en une phrase courte (affichée sous le calendrier et dans la séance). */
export function zonesSourceSentence(zones: HeartRateZones, source: ZonesSource): string {
  if (source === "watch") {
    const lthr = zones.lactateThresholdHeartRateBpm;
    const parts = [lthr ? `seuil ${lthr} bpm${thresholdAtZ4Z5Boundary(zones) ? ", à la limite Z4/Z5" : ""}` : null, zones.maxHeartRateBpm ? `FC max ${zones.maxHeartRateBpm} bpm` : null].filter(Boolean);
    return `Zones de ta montre${parts.length ? ` (${parts.join(", ")})` : ""}.`;
  }
  if (source === "history") return `Zones déduites de tes courses : FC max observée ${zones.maxHeartRateBpm} bpm, en % de FC max.`;
  return "Zones provisoires : pas encore de course avec fréquence cardiaque.";
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

/** Le seuil est-il à la frontière Z4/Z5 (Z5 commençant au plus 5 bpm sous lui, convention Garmin) ? */
export function thresholdAtZ4Z5Boundary(zones: HeartRateZones): boolean {
  const lthr = zones.lactateThresholdHeartRateBpm;
  return lthr != null && lthr >= zones.floors[4] && lthr - zones.floors[4] <= 5;
}
