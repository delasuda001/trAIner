import type { RoledSegment } from "./segment-roles";

export type VariationProfileLabel =
  | "steady"
  | "progressive"
  | "intervalled"
  | "fartlek_like"
  | "technical_variation_possible"
  | "unknown";

export type VariationProfile = {
  label: VariationProfileLabel;
  confidence: "high" | "moderate" | "low";
  /** Signal indépendant du label : au moins un segment de récupération franchement lent (marche/trot). */
  hasRecoveryOrWalkSegments: boolean;
};

/**
 * Constantes empiriques initiales, à valider sur des séances réelles avant
 * mise en production (même statut que MIN_HR_RATIO_BY_DURATION_S/
 * DEGRADATION_TOLERANCE dans thresholds.ts).
 */
const STEADY_SPEED_CV_MAX = 0.06;
const INTERVALLED_DURATION_CV_MAX = 0.15;
const INTERVALLED_RECOVERY_DURATION_CV_MAX = 0.25;
const PROGRESSIVE_MONOTONIC_RATIO_MIN = 0.8;
const PROGRESSIVE_MIN_RELATIVE_GAIN = 0.1;
const PROGRESSIVE_MONOTONIC_TOLERANCE = 0.02;
const TECHNICAL_VARIATION_MIN_CV = 0.08;

export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (mean === 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function monotonicIncreaseRatio(values: number[]): number {
  if (values.length < 2) return 0;
  let increases = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] >= values[index - 1] * (1 - PROGRESSIVE_MONOTONIC_TOLERANCE)) increases += 1;
  }
  return increases / (values.length - 1);
}

/**
 * Part du gain total portée par la plus grosse marche unique. Une séance
 * "progressive" répartit son gain sur plusieurs paliers ; une séance plate
 * suivie d'une seule accélération finale (sprint intentionnel) ne doit pas
 * être confondue avec une progression continue.
 */
function maxSingleStepShare(values: number[]): number {
  const totalGain = values[values.length - 1] - values[0];
  if (totalGain <= 0) return 1;
  let maxStep = 0;
  for (let index = 1; index < values.length; index += 1) {
    maxStep = Math.max(maxStep, values[index] - values[index - 1]);
  }
  return maxStep / totalGain;
}

const PROGRESSIVE_MAX_SINGLE_STEP_SHARE = 0.6;

/**
 * Caractérise la forme de variation d'une séance à partir de ses segments
 * rôlés (cf. segment-roles.ts), pour éviter qu'une variabilité volontaire
 * (fartlek, progression, côtes, gammes) soit confondue avec un défaut
 * d'exécution par le verdict (verdict.ts).
 *
 * Décision finale B : `technical_variation_possible` reste un signal
 * interne prudent — sa confiance ne dépasse jamais `"moderate"`, et il ne
 * doit jamais être présenté comme la détection affirmative d'un travail
 * technique (gammes/éducatifs). Cette limite vient du plancher de
 * segmentation existant (90 s minimum par segment, `segmentation.ts`) qui
 * empêche de résoudre finement des accélérations courtes.
 */
export function classifySessionVariationProfile(roled: RoledSegment[]): VariationProfile {
  const mainSequence = roled.filter((segment) => segment.averageSpeedMps != null);
  const workSegments = roled.filter((segment) => segment.role === "work" && segment.averageSpeedMps != null);
  const recoverySegments = roled.filter((segment) => segment.role === "recovery");
  const hasRecoveryOrWalkSegments = recoverySegments.some((segment) => segment.zone === "recovery");

  if (mainSequence.length < 2) {
    return { label: "unknown", confidence: "low", hasRecoveryOrWalkSegments };
  }

  const mainSpeeds = mainSequence.map((segment) => segment.averageSpeedMps as number);
  const mainSpeedCv = coefficientOfVariation(mainSpeeds);

  // Alternance travail/récupération avec au moins 2 cycles.
  if (workSegments.length >= 2 && recoverySegments.length >= 2) {
    const workDurationCv = coefficientOfVariation(workSegments.map((s) => s.durationS));
    const recoveryDurationCv = coefficientOfVariation(recoverySegments.map((s) => s.durationS));
    const homogeneous =
      workDurationCv != null &&
      workDurationCv <= INTERVALLED_DURATION_CV_MAX &&
      (recoveryDurationCv == null || recoveryDurationCv <= INTERVALLED_RECOVERY_DURATION_CV_MAX);
    if (homogeneous) {
      return { label: "intervalled", confidence: "high", hasRecoveryOrWalkSegments };
    }
    return { label: "fartlek_like", confidence: "moderate", hasRecoveryOrWalkSegments };
  }

  // Tendance croissante continue (sortie progressive).
  const monotonicRatio = monotonicIncreaseRatio(mainSpeeds);
  const relativeGain = mainSpeeds[0] > 0 ? (mainSpeeds[mainSpeeds.length - 1] - mainSpeeds[0]) / mainSpeeds[0] : 0;
  const singleStepShare = maxSingleStepShare(mainSpeeds);
  if (
    monotonicRatio >= PROGRESSIVE_MONOTONIC_RATIO_MIN &&
    relativeGain >= PROGRESSIVE_MIN_RELATIVE_GAIN &&
    singleStepShare <= PROGRESSIVE_MAX_SINGLE_STEP_SHARE
  ) {
    return { label: "progressive", confidence: mainSequence.length >= 4 ? "high" : "moderate", hasRecoveryOrWalkSegments };
  }

  // Allure homogène sur l'ensemble de la séance.
  if (mainSpeedCv != null && mainSpeedCv <= STEADY_SPEED_CV_MAX) {
    return { label: "steady", confidence: mainSequence.length >= 3 ? "high" : "moderate", hasRecoveryOrWalkSegments };
  }

  // Variabilité notable, mais insuffisante pour une alternance travail/récupération
  // franche (fartlek/intervalled) : signal prudent, jamais affirmatif (Décision finale B).
  if (mainSpeedCv != null && mainSpeedCv > TECHNICAL_VARIATION_MIN_CV && workSegments.length <= 2) {
    return { label: "technical_variation_possible", confidence: "moderate", hasRecoveryOrWalkSegments };
  }

  return { label: "unknown", confidence: "low", hasRecoveryOrWalkSegments };
}
