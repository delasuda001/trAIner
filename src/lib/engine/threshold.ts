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

export function thresholdEvidence(runs: ThresholdRun[], today: string, thresholdHeartRateBpm: number | null): ThresholdEvidence[] {
  if (thresholdHeartRateBpm == null) return [];
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
      if (hr < thresholdHeartRateBpm - HR_BELOW || hr > thresholdHeartRateBpm + HR_ABOVE) return [];
      return [{ localDate: run.localDate, reps: work.reps, repDistanceM: work.averageDistanceM, repDurationS: work.averageDurationS, speedMps: work.averageSpeedMps, heartRateBpm: Math.round(hr) }];
    })
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, MAX_SESSIONS);
}

export function estimateThreshold(input: { runs: ThresholdRun[]; today: string; watchSpeedMps: number | null; thresholdHeartRateBpm: number | null }): ThresholdEstimate {
  const evidence = thresholdEvidence(input.runs, input.today, input.thresholdHeartRateBpm);
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
      basis: `seuil observé ${pace(observed)} (${proof})${watch != null ? `, la montre l'estime à ${pace(watch)}` : ""}`,
    };
  }
  if (watch != null) {
    return { speedMps: watch, source: "watch", watchSpeedMps: watch, observedSpeedMps: observed, evidence, basis: `seuil montre ${pace(watch)}` };
  }
  return { speedMps: null, source: "none", watchSpeedMps: null, observedSpeedMps: null, evidence, basis: "seuil inconnu" };
}
