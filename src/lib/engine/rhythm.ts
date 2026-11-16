import { addDays, daysBetween } from "@/lib/dates";
import type { SessionFamily } from "./activity-metrics";
import { median } from "./stats";

/**
 * Rythme habituel du coureur sur 12 semaines. Les règles de placement et de
 * charge s'y adaptent au lieu de valeurs fixes calées sur un coureur à 1–2
 * sorties par semaine :
 * - écart minimal entre deux séances de qualité : son habitude (médiane des
 *   écarts), bornée entre 48 h et 72 h ; 72 h faute d'historique suffisant ;
 * - seuil de « hausse marquée » du ratio 7 j / 4 semaines : 1,5 jusqu'à
 *   3 sorties par semaine (ratio bruité, une sortie de plus le fait bondir),
 *   1,3 à partir de 5 (ratio stable, une hausse de 30 % est réelle), linéaire entre.
 */

export type RhythmRun = { localDate: string; family: SessionFamily };

export type Rhythm = {
  runsPerWeek12w: number;
  /** Médiane des écarts (jours) entre séances de qualité successives, si au moins 4 écarts. */
  qualityGapMedianDays: number | null;
  /** Écart minimal à respecter entre deux séances de qualité (2 ou 3 jours). */
  qualitySpacingDays: number;
  /** Ratio charge 7 j / moyenne 4 semaines à partir duquel la hausse est « marquée ». */
  highLoadRatio: number;
};

export const RHYTHM_WEEKS = 12;
export const DEFAULT_QUALITY_SPACING_DAYS = 3;
const MIN_QUALITY_GAPS = 4;
const QUALITY_FAMILIES: ReadonlySet<SessionFamily> = new Set(["intervals", "steady"]);

export function highLoadRatioFor(runsPerWeek: number): number {
  if (runsPerWeek <= 3) return 1.5;
  if (runsPerWeek >= 5) return 1.3;
  return Math.round((1.5 - (runsPerWeek - 3) * 0.1) * 20) / 20;
}

/** Rythme vu à la date `today` (courses STRICTEMENT antérieures ou du jour, plus anciennes d'abord ou non). */
export function runningRhythm(runs: RhythmRun[], today: string): Rhythm {
  const start = addDays(today, -RHYTHM_WEEKS * 7);
  const window = runs.filter((run) => run.localDate > start && run.localDate <= today);
  const runsPerWeek12w = Math.round((window.length / RHYTHM_WEEKS) * 10) / 10;
  const qualityDates = [...new Set(window.filter((run) => QUALITY_FAMILIES.has(run.family)).map((run) => run.localDate))].sort();
  const gaps = qualityDates.slice(1).map((date, index) => daysBetween(qualityDates[index], date));
  const qualityGapMedianDays = gaps.length >= MIN_QUALITY_GAPS ? (median(gaps) as number) : null;
  const qualitySpacingDays = qualityGapMedianDays == null ? DEFAULT_QUALITY_SPACING_DAYS : Math.min(DEFAULT_QUALITY_SPACING_DAYS, Math.max(2, Math.floor(qualityGapMedianDays)));
  return { runsPerWeek12w, qualityGapMedianDays, qualitySpacingDays, highLoadRatio: highLoadRatioFor(runsPerWeek12w) };
}

/** « 72 h », « 48 h » : l'écart en clair, tel qu'il apparaît dans les consignes. */
export function spacingHours(days: number): string {
  return `${days * 24} h`;
}
