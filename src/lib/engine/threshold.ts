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

export type ThresholdRun = { localDate: string; metrics: ActivityMetrics; movingTimeS?: number | null; distanceM?: number | null };

/** Continu retenu comme preuve de seuil (seulement sans autre source) : durée hors échauffement et terrain. */
const CONTINUOUS_MIN_S = 20 * 60;
const CONTINUOUS_WARMUP_S = 5 * 60;
const CONTINUOUS_MAX_ELEVATION_PER_KM = 12;

/**
 * Sans seuil de la montre ni répétitions probantes : un effort continu d'au moins 20 min (hors
 * 5 premières minutes), FC moyenne dans la moitié haute de la bande du seuil, sur terrain roulant. Indicatif.
 */
export function continuousThresholdEvidence(runs: ThresholdRun[], today: string, band: ThresholdBand): ThresholdEvidence[] {
  const from = addDays(today, -OBSERVED_WINDOW_DAYS);
  return runs
    .filter((run) => run.localDate > from && run.localDate <= today && run.metrics.structure === "continuous")
    .flatMap((run): ThresholdEvidence[] => {
      const hr = run.metrics.mainHeartRateBpm;
      const speed = run.metrics.mainSpeedMps;
      const durationS = (run.movingTimeS ?? 0) - CONTINUOUS_WARMUP_S;
      if (hr == null || speed == null || durationS < CONTINUOUS_MIN_S) return [];
      if ((run.metrics.elevationGainPerKm ?? 0) > CONTINUOUS_MAX_ELEVATION_PER_KM) return [];
      // Moitié haute de la bande : un continu en bas de Z4 est un tempo long, pas le seuil.
      if (hr < (band.low + band.high) / 2 || hr > band.high) return [];
      return [{ localDate: run.localDate, reps: 1, repDistanceM: speed * durationS, repDurationS: durationS, speedMps: speed, heartRateBpm: Math.round(hr) }];
    })
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, MAX_SESSIONS);
}

/** Répétitions courtes (3 à 6 min) : dernier recours, sans seuil montre ni autre preuve. */
const SHORT_REP_MIN_S = 180;
const SHORT_REP_MIN_M = 800;
const SHORT_WORK_MIN_S = 12 * 60;
/** Sur des répétitions courtes, la FC moyenne reste sous celle du seuil (elle monte en retard) : bande élargie vers le bas. */
const SHORT_REP_HR_SLACK = 4;

/**
 * Sans seuil de la montre, ni répétitions longues, ni continu probant : des répétitions de 3 à 6 min
 * (ou 800 m et plus, 12 min de travail au moins) courues dans la bande du seuil (élargie de 4 bpm vers
 * le bas, la FC n'ayant pas le temps de monter) donnent un seuil indicatif. Il sert surtout à donner des
 * allures cibles aux fractionnés plutôt qu'une FC impossible à suivre sur 3 min.
 */
export function shortRepThresholdEvidence(runs: ThresholdRun[], today: string, band: ThresholdBand): ThresholdEvidence[] {
  const from = addDays(today, -OBSERVED_WINDOW_DAYS);
  return runs
    .filter((run) => run.localDate > from && run.localDate <= today)
    .flatMap((run): ThresholdEvidence[] => {
      const work = run.metrics.work;
      if (!work || work.averageHeartRateBpm == null || work.reps < 2) return [];
      const longEnough = work.averageDurationS >= SHORT_REP_MIN_S || (work.averageDistanceM ?? 0) >= SHORT_REP_MIN_M;
      if (!longEnough || work.reps * work.averageDurationS < SHORT_WORK_MIN_S) return [];
      if ((run.metrics.elevationGainPerKm ?? 0) > MAX_ELEVATION_PER_KM) return [];
      const hr = work.averageHeartRateBpm;
      if (hr < band.low - SHORT_REP_HR_SLACK || hr > band.high) return [];
      return [{ localDate: run.localDate, reps: work.reps, repDistanceM: work.averageDistanceM, repDurationS: work.averageDurationS, speedMps: work.averageSpeedMps, heartRateBpm: Math.round(hr) }];
    })
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, MAX_SESSIONS);
}

/** Effort continu soutenu (course, test) : 12 semaines, 20 min au moins, FC moyenne en Z4 au moins. */
const RACE_WINDOW_DAYS = 84;
/** Exposant de Riegel : allure tenue 1 h ≈ seuil. */
const RIEGEL_EXPONENT = 1.06;

/**
 * Dernier recours sans montre ni répétitions : le meilleur effort continu soutenu des 12 dernières
 * semaines (une course, souvent), ramené à l'allure tenable une heure (Riegel), qui approche le seuil.
 * Un semi en 1:23:43 (3:56/km) et un 10 km en 37:41 (3:44/km) donnent tous deux ≈ 3:50/km.
 */
export function sustainedEffortEvidence(runs: ThresholdRun[], today: string, zoneFloors: number[] | null | undefined): ThresholdEvidence[] {
  if (!zoneFloors || zoneFloors.length < 5) return [];
  const from = addDays(today, -RACE_WINDOW_DAYS);
  const candidates = runs.flatMap((run): ThresholdEvidence[] => {
    if (run.localDate <= from || run.localDate > today || run.metrics.structure !== "continuous") return [];
    const hr = run.metrics.mainHeartRateBpm;
    const speed = run.metrics.mainSpeedMps;
    const durationS = run.movingTimeS ?? 0;
    if (hr == null || speed == null || durationS < CONTINUOUS_MIN_S || hr < zoneFloors[3]) return [];
    if ((run.metrics.elevationGainPerKm ?? 0) > CONTINUOUS_MAX_ELEVATION_PER_KM) return [];
    const hourSpeed = speed / Math.pow(3600 / durationS, RIEGEL_EXPONENT - 1);
    return [{ localDate: run.localDate, reps: 1, repDistanceM: speed * durationS, repDurationS: durationS, speedMps: hourSpeed, heartRateBpm: Math.round(hr) }];
  });
  return candidates.sort((a, b) => b.speedMps - a.speedMps).slice(0, 1);
}

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
  /**
   * Seuil tiré en dernier recours (répétitions courtes, meilleur effort continu) : assez bon pour donner
   * des allures cibles, pas pour juger qu'une séance « n'est pas du type reconnu ».
   */
  indicative?: boolean;
};

function pace(speedMps: number): string {
  return formatPace(speedMps);
}

function repLabel(evidence: ThresholdEvidence): string {
  if (evidence.reps === 1) return `continu de ${Math.round(evidence.repDurationS / 60)} min`;
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
  const reps = thresholdEvidence(input.runs, input.today, input.thresholdHeartRateBpm, input.zoneFloors);
  const band = thresholdBand(input.thresholdHeartRateBpm, input.zoneFloors);
  // Seuil inconnu autrement (ni montre, ni répétitions) : un continu au seuil fait foi, à titre indicatif.
  const continuous = reps.length || input.watchSpeedMps != null || band == null ? reps : continuousThresholdEvidence(input.runs, input.today, band);
  // Dernier recours (ni montre, ni répétitions longues, ni continu) : répétitions courtes, indicatives.
  const short = continuous.length || input.watchSpeedMps != null || band == null ? continuous : shortRepThresholdEvidence(input.runs, input.today, band);
  const sustained = short.length || input.watchSpeedMps != null ? [] : sustainedEffortEvidence(input.runs, input.today, input.zoneFloors);
  const evidence = sustained.length ? sustained : short;
  const indicative = input.thresholdHeartRateBpm == null;
  const watch = input.watchSpeedMps;
  // Moyenne des allures (s/km), pas des vitesses : c'est ce que lit un coureur.
  const observedPaceS = evidence.length ? Math.round(evidence.reduce((sum, entry) => sum + paceSeconds(entry.speedMps), 0) / evidence.length) : null;
  const observed = observedPaceS != null ? 1000 / observedPaceS : null;
  const proof = sustained.length
    ? sustained.map((entry) => `effort continu de ${Math.round(entry.repDurationS / 60)} min du ${formatDate(entry.localDate, "short")} sur ${String(Math.round((entry.repDistanceM ?? 0) / 100) / 10).replace(".", ",")} km, ramené à l'allure tenable une heure`).join(", ")
    : evidence.map((entry) => `${repLabel(entry)} du ${formatDate(entry.localDate, "short")} à ${pace(entry.speedMps)} pour ${entry.heartRateBpm} bpm`).join(", ");
  if (observed != null && (watch == null || paceSeconds(watch) - (observedPaceS as number) >= OBSERVED_MIN_GAIN_S)) {
    return {
      speedMps: observed,
      source: "observed",
      watchSpeedMps: watch,
      observedSpeedMps: observed,
      evidence,
      ...(evidence !== continuous ? { indicative: true } : {}),
      basis: `seuil observé ${pace(observed)} (${proof})${watch != null ? `, la montre l'estime à ${pace(watch)}` : ""}${sustained.length ? " ; indicatif" : indicative ? ` ; indicatif : la montre ne donne pas de FC seuil, ${evidence.every((entry) => entry.reps === 1) ? "effort continu retenu en Z4" : "répétitions retenues en Z4"}` : ""}`,
    };
  }
  if (watch != null) {
    return { speedMps: watch, source: "watch", watchSpeedMps: watch, observedSpeedMps: observed, evidence, basis: `seuil montre ${pace(watch)}` };
  }
  return { speedMps: null, source: "none", watchSpeedMps: null, observedSpeedMps: null, evidence, basis: "seuil inconnu" };
}
