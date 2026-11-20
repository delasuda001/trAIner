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
export function zonesSourceSentence(zones: HeartRateZones, source: ZonesSource, recalibration?: EasyZonesRecalibration | null): string {
  const recalibrated = recalibration ? ` Z2 recalée sur tes footings (médiane ${recalibration.easyMedianBpm} bpm sur ${recalibration.runs} sorties) : haut de Z2 à ${recalibration.z2HighBpm} bpm au lieu de ${recalibration.watchZ2HighBpm}.` : "";
  if (source === "watch") {
    const lthr = zones.lactateThresholdHeartRateBpm;
    const parts = [lthr ? `seuil ${lthr} bpm${thresholdAtZ4Z5Boundary(zones) ? ", à la limite Z4/Z5" : ""}` : null, zones.maxHeartRateBpm ? `FC max ${zones.maxHeartRateBpm} bpm` : null].filter(Boolean);
    return `Zones de ta montre${parts.length ? ` (${parts.join(", ")})` : ""}.${recalibrated}`;
  }
  if (source === "history") return `Zones déduites de tes courses : FC max observée ${zones.maxHeartRateBpm} bpm, en % de FC max.${recalibrated}`;
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

/* ---------- Zones faciles recalées sur les footings ---------- */

/** Marge (bpm) au-delà du haut de la Z2 à partir de laquelle ses footings disent que la Z2 est trop basse. */
export const EASY_ABOVE_Z2_MARGIN_BPM = 5;
export const MIN_EASY_RUNS_FOR_RECALIBRATION = 5;
/** Le haut de la Z2 recalée reste à au moins cet écart sous le plancher de la Z4. */
const Z4_GAP_BPM = 5;
/** Une FC moyenne de footing cache des passages plus hauts (côtes, fin de sortie) : marge au-dessus du 9e décile. */
const AVERAGE_TO_PEAK_MARGIN_BPM = 3;
/** Largeur minimale gardée à la Z2 recalée. */
const MIN_Z2_WIDTH_BPM = 10;

export type EasyZonesRecalibration = {
  /** FC médiane de ses footings (portions aérobies stables), bpm. */
  easyMedianBpm: number;
  /** Haut de la Z2 de la montre, avant recalage. */
  watchZ2HighBpm: number;
  /** Haut de la Z2 recalée. */
  z2HighBpm: number;
  runs: number;
};

function quantile(sorted: number[], share: number): number {
  const position = (sorted.length - 1) * share;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * Zones sans FC seuil (réglées en % de FC max, par la montre ou par défaut) : si ses footings
 * tournent nettement au-dessus de la Z2 (médiane ≥ haut de Z2 + 5 bpm, sur 5 sorties au moins),
 * la Z2 est trop basse pour lui. Elle est alors décalée vers le haut : son haut devient le
 * 9e décile des FC moyennes de ses footings + 3 bpm (borné à 5 bpm sous la Z4), son bas monte d'autant.
 * Les zones 4 et 5 (intensité) ne bougent pas. Une seule définition du « facile » ensuite :
 * cibles, classement des séances, temps en zones et consignes l'utilisent.
 * Zones ancrées sur une FC seuil : jamais touchées (elles sont mesurées).
 */
export function recalibrateEasyZones(zones: HeartRateZones, easyRunHeartRates: number[]): { zones: HeartRateZones; recalibration: EasyZonesRecalibration } | null {
  if (zones.lactateThresholdHeartRateBpm != null) return null;
  const easy = easyRunHeartRates.filter((value) => value > 0).sort((a, b) => a - b);
  if (easy.length < MIN_EASY_RUNS_FOR_RECALIBRATION) return null;
  const [z1, z2, z3, z4, z5] = zones.floors;
  const watchZ2High = z3 - 1;
  const easyMedian = quantile(easy, 0.5);
  if (easyMedian < watchZ2High + EASY_ABOVE_Z2_MARGIN_BPM) return null;
  const z2High = Math.min(z4 - Z4_GAP_BPM, Math.round(quantile(easy, 0.9)) + AVERAGE_TO_PEAK_MARGIN_BPM);
  if (z2High <= watchZ2High) return null;
  const shift = z2High - watchZ2High;
  const z2Low = Math.min(z2 + shift, z2High - MIN_Z2_WIDTH_BPM);
  return {
    zones: { ...zones, floors: [z1, z2Low, z2High + 1, z4, z5] },
    recalibration: { easyMedianBpm: Math.round(easyMedian), watchZ2HighBpm: watchZ2High, z2HighBpm: z2High, runs: easy.length },
  };
}
