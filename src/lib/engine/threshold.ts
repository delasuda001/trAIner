import { formatDate, formatPace } from "@/lib/formatters";
import { addDays } from "@/lib/dates";
import type { ActivityMetrics } from "./activity-metrics";
import { paceSeconds } from "./activity-metrics";

/**
 * Seuil observé en séance, face au seuil estimé par la montre.
 *
 * La montre réévalue rarement son seuil ; des répétitions longues courues à la
 * FC du seuil disent mieux où il en est. On ne retient que des preuves fiables :
 * - séances des 8 dernières semaines ;
 * - répétitions d'au moins 6 min (ou 1 600 m), 15 min de travail au total ;
 * - FC moyenne des répétitions entre FC seuil − 6 et FC seuil + 3 bpm
 *   (au-dessus, l'allure dépasse le seuil ; en dessous, elle le sous-estime) ;
 * - terrain roulant (≤ 10 m de D+ par km).
 * Le seuil observé (moyenne des 3 plus récentes) ne remplace celui de la montre
 * que s'il est plus rapide d'au moins 8 s/km. Sinon, la montre reste la référence.
 *
 * Montre sans FC seuil (zones en % de FC max) : la bande de FC retenue est la Z4
 * du profil (début de Z4 à début de Z5 − 1) ; le seuil obtenu est dit indicatif.
 */

export const OBSERVED_WINDOW_DAYS = 56;
const MIN_REP_S = 360;
const MIN_REP_M = 1600;
const MIN_WORK_S = 900;
const HR_BELOW = 6;
const HR_ABOVE = 3;
const MAX_ELEVATION_PER_KM = 10;
const MAX_SESSIONS = 3;
/** Écart minimal (s/km) pour préférer le seuil observé à celui de la montre. */
export const OBSERVED_MIN_GAIN_S = 8;

export type ThresholdRun = { localDate: string; metrics: ActivityMetrics };

export type ThresholdEvidence = { localDate: string; reps: number; repDistanceM: number | null; repDurationS: number; speedMps: number; heartRateBpm: number };

export type ThresholdEstimate = {
  /** Vitesse retenue pour les cibles et les estimations. */
  speedMps: number | null;
  source: "watch" | "observed" | "none";
  watchSpeedMps: number | null;
  observedSpeedMps: number | null;
  evidence: ThresholdEvidence[];
  /** Phrase courte, chiffrée : d'où vient le seuil retenu. */
  basis: string;
};

function pace(speedMps: number): string {
  return formatPace(speedMps);
}

function repLabel(evidence: ThresholdEvidence): string {
  const distance = evidence.repDistanceM && evidence.repDistanceM >= 950 ? `${String(Math.round(evidence.repDistanceM / 100) / 10).replace(".", ",")} km` : `${Math.round(evidence.repDurationS / 60)} min`;
  return `${evidence.reps} × ${distance}`;
}

/** Bande de FC d'un travail au seuil : autour de la FC seuil, sinon la Z4 du profil. */
export type ThresholdBand = { low: number; high: number; fromZones: boolean };

export function thresholdBand(thresholdHeartRateBpm: number | null, zoneFloors?: number[] | null): ThresholdBand | null {
  if (thresholdHeartRateBpm != null) return { low: thresholdHeartRateBpm - HR_BELOW, high: thresholdHeartRateBpm + HR_ABOVE, fromZones: false };
  if (zoneFloors && zoneFloors.length >= 5) return { low: zoneFloors[3], high: zoneFloors[4] - 1, fromZones: true };
  return null;
}

export function thresholdEvidence(runs: ThresholdRun[], today: string, thresholdHeartRateBpm: number | null, zoneFloors?: number[] | null): ThresholdEvidence[] {
  const band = thresholdBand(thresholdHeartRateBpm, zoneFloors);
  if (band == null) return [];
  const from = addDays(today, -OBSERVED_WINDOW_DAYS);
  return runs
    .filter((run) => run.localDate > from && run.localDate <= today)
    .flatMap((run): ThresholdEvidence[] => {
      const work = run.metrics.work;
      if (!work || work.averageHeartRateBpm == null || work.reps < 2) return [];
      const longEnough = work.averageDurationS >= MIN_REP_S || (work.averageDistanceM ?? 0) >= MIN_REP_M;
      if (!longEnough || work.reps * work.averageDurationS < MIN_WORK_S) return [];
      if ((run.metrics.elevationGainPerKm ?? 0) > MAX_ELEVATION_PER_KM) return [];
      const hr = work.averageHeartRateBpm;
      if (hr < band.low || hr > band.high) return [];
      return [{ localDate: run.localDate, reps: work.reps, repDistanceM: work.averageDistanceM, repDurationS: work.averageDurationS, speedMps: work.averageSpeedMps, heartRateBpm: Math.round(hr) }];
    })
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, MAX_SESSIONS);
}

export function estimateThreshold(input: { runs: ThresholdRun[]; today: string; watchSpeedMps: number | null; thresholdHeartRateBpm: number | null; zoneFloors?: number[] | null }): ThresholdEstimate {
  const evidence = thresholdEvidence(input.runs, input.today, input.thresholdHeartRateBpm, input.zoneFloors);
  const indicative = input.thresholdHeartRateBpm == null;
  const watch = input.watchSpeedMps;
  // Moyenne des allures (s/km), pas des vitesses : c'est ce que lit un coureur.
  const observedPaceS = evidence.length ? Math.round(evidence.reduce((sum, entry) => sum + paceSeconds(entry.speedMps), 0) / evidence.length) : null;
  const observed = observedPaceS != null ? 1000 / observedPaceS : null;
  const proof = evidence.map((entry) => `${repLabel(entry)} du ${formatDate(entry.localDate, "short")} à ${pace(entry.speedMps)} pour ${entry.heartRateBpm} bpm`).join(", ");
  if (observed != null && (watch == null || paceSeconds(watch) - (observedPaceS as number) >= OBSERVED_MIN_GAIN_S)) {
    return {
      speedMps: observed,
      source: "observed",
      watchSpeedMps: watch,
      observedSpeedMps: observed,
      evidence,
      basis: `seuil observé ${pace(observed)} (${proof})${watch != null ? `, la montre l'estime à ${pace(watch)}` : ""}${indicative ? " ; indicatif : la montre ne donne pas de FC seuil, répétitions retenues en Z4" : ""}`,
    };
  }
  if (watch != null) {
    return { speedMps: watch, source: "watch", watchSpeedMps: watch, observedSpeedMps: observed, evidence, basis: `seuil montre ${pace(watch)}` };
  }
  return { speedMps: null, source: "none", watchSpeedMps: null, observedSpeedMps: null, evidence, basis: "seuil inconnu" };
}
