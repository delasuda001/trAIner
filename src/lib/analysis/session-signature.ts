import { classifySegmentRoles, type RoledSegment } from "./segment-roles";
import { classifySessionVariationProfile, type VariationProfile } from "./variation-profile";
import type { TrainingZone } from "./zones";
import type { SegmentationResult } from "./types";

export type WorkDurationBucket = "short" | "medium" | "long";

/** Bucket de durée d'un segment de travail, réutilisé pour le score de comparabilité. */
export function getWorkRepBucket(durationS: number): WorkDurationBucket {
  if (durationS < 90) return "short";
  if (durationS <= 240) return "medium";
  return "long";
}

export type SessionSignature = {
  activityId: string;
  activityDate: string;
  sportType: string | null;
  totalDistanceM: number | null;
  totalMovingTimeS: number | null;
  elevationGainM: number | null;
  /** Mesuré sur les segments role="work" uniquement, jamais fabriqué. */
  workSegmentCount: number;
  averageWorkSegmentDurationS: number | null;
  workDurationBucket: WorkDurationBucket | null;
  totalWorkDurationS: number | null;
  /** Calculé sur CETTE activité, jamais copié depuis une autre séance. */
  dominantZone: TrainingZone | null;
  /** Vs le même thresholdSpeedMps que la séance courante (cf. résolution à 3 cas dans context.ts). */
  averagePercentOfThreshold: number | null;
  recoverySegmentCount: number;
  averageRecoveryDurationS: number | null;
  workToRestRatio: number | null;
  variationProfile: VariationProfile;
  signatureQuality: "measured" | "unavailable";
};

export type BuildSessionSignatureInput = {
  activityId: string;
  activityDate: string;
  sportType: string | null;
  totalDistanceM: number | null;
  totalMovingTimeS: number | null;
  elevationGainM: number | null;
  segmented: SegmentationResult;
  /** Seuil (ou référence déclarée) partagé par la séance courante ET tous les candidats. */
  thresholdSpeedMps: number | null;
};

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function computeDominantZone(workSegments: RoledSegment[]): TrainingZone | null {
  const counts = new Map<TrainingZone, number>();
  for (const segment of workSegments) {
    if (segment.zone) counts.set(segment.zone, (counts.get(segment.zone) ?? 0) + 1);
  }
  let best: TrainingZone | null = null;
  let bestCount = -1;
  for (const [zone, count] of counts) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Construit la signature déterministe d'une séance à partir de ses segments
 * déjà rôlés (segment-roles.ts). Utilisée à la fois pour la séance courante
 * et pour chaque candidat historique disposant d'un cache de détail — avec
 * le même `thresholdSpeedMps` des deux côtés, pour une comparaison
 * réellement apples-to-apples (cf. §4.2 dans context.ts pour la résolution
 * de ce seuil en 3 cas).
 */
export function buildSessionSignature(input: BuildSessionSignatureInput): SessionSignature {
  const { segments: roled, confidence: roleConfidence } = classifySegmentRoles(input.segmented.segments, input.thresholdSpeedMps);
  const variationProfile = classifySessionVariationProfile(roled);

  const workSegments = roled.filter((segment) => segment.role === "work");
  const recoverySegments = roled.filter((segment) => segment.role === "recovery");

  const totalWorkDurationS = workSegments.length > 0 ? workSegments.reduce((sum, s) => sum + s.durationS, 0) : null;
  const averageWorkSegmentDurationS = workSegments.length > 0 && totalWorkDurationS != null ? totalWorkDurationS / workSegments.length : null;
  const workDurationBucket = averageWorkSegmentDurationS != null ? getWorkRepBucket(averageWorkSegmentDurationS) : null;

  const totalRecoveryDurationS = recoverySegments.length > 0 ? recoverySegments.reduce((sum, s) => sum + s.durationS, 0) : null;
  const averageRecoveryDurationS = recoverySegments.length > 0 && totalRecoveryDurationS != null ? totalRecoveryDurationS / recoverySegments.length : null;
  const workToRestRatio = totalWorkDurationS != null && totalRecoveryDurationS != null && totalRecoveryDurationS > 0 ? totalWorkDurationS / totalRecoveryDurationS : null;

  const averagePercentOfThreshold = average(workSegments.map((s) => s.percentOfThreshold).filter((v): v is number => v != null));

  const signatureQuality: "measured" | "unavailable" =
    roleConfidence === "high" && workSegments.length > 0 && input.thresholdSpeedMps != null ? "measured" : "unavailable";

  return {
    activityId: input.activityId,
    activityDate: input.activityDate,
    sportType: input.sportType,
    totalDistanceM: input.totalDistanceM,
    totalMovingTimeS: input.totalMovingTimeS,
    elevationGainM: input.elevationGainM,
    workSegmentCount: workSegments.length,
    averageWorkSegmentDurationS,
    workDurationBucket,
    totalWorkDurationS,
    dominantZone: computeDominantZone(workSegments),
    averagePercentOfThreshold,
    recoverySegmentCount: recoverySegments.length,
    averageRecoveryDurationS,
    workToRestRatio,
    variationProfile,
    signatureQuality,
  };
}

export type ComparabilityGuardrail = "recovery_mismatch" | "elevation_mismatch";

export type ComparabilityResult = {
  score: number;
  tier: "high" | "moderate" | "excluded";
  guardrailsApplied: ComparabilityGuardrail[];
  breakdown: {
    zoneMatch: number;
    durationBucketMatch: number;
    repCountSimilarity: number;
    workVolumeSimilarity: number;
    recoverySimilarity: number;
  };
};

const WORK_ZONE_ORDER: readonly TrainingZone[] = ["tempo", "threshold", "vo2max", "anaerobic"];
const BUCKET_ORDER: readonly WorkDurationBucket[] = ["short", "medium", "long"];

/** Récupération/dénivelé très différents malgré des fractions similaires : jamais présenté comme fortement comparable. */
const RECOVERY_MISMATCH_RATIO = 2;
const ELEVATION_MISMATCH_RATIO = 0.5;

const WEIGHTS = { zoneMatch: 0.3, durationBucketMatch: 0.2, repCountSimilarity: 0.15, workVolumeSimilarity: 0.15, recoverySimilarity: 0.2 };

function adjacencyScore<T>(order: readonly T[], a: T | null, b: T | null): number {
  if (a == null || b == null) return 0;
  if (a === b) return 1;
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia === -1 || ib === -1) return 0;
  return Math.abs(ia - ib) === 1 ? 0.5 : 0;
}

function ratioSimilarity(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  if (a === 0 || b === 0) return 0;
  return 1 - Math.min(1, Math.abs(a - b) / Math.max(a, b));
}

/**
 * Score de comparabilité entre la séance courante et un candidat historique
 * "measured" (cf. buildSessionSignature). Renvoie `null` quand le candidat
 * ne franchit même pas les filtres éliminatoires — il n'entre alors pas
 * dans le pool de séances comparables.
 */
export function computeComparability(current: SessionSignature, candidate: SessionSignature): ComparabilityResult | null {
  if (candidate.signatureQuality !== "measured") return null;
  if (candidate.sportType && !/run|running/i.test(candidate.sportType)) return null;
  if (candidate.workSegmentCount <= 0) return null;

  const zoneMatch = adjacencyScore(WORK_ZONE_ORDER, current.dominantZone, candidate.dominantZone);
  const durationBucketMatch = adjacencyScore(BUCKET_ORDER, current.workDurationBucket, candidate.workDurationBucket);
  const repCountSimilarity = ratioSimilarity(current.workSegmentCount, candidate.workSegmentCount);
  const workVolumeSimilarity =
    current.totalWorkDurationS != null && candidate.totalWorkDurationS != null
      ? ratioSimilarity(current.totalWorkDurationS, candidate.totalWorkDurationS)
      : 0.5;
  const recoverySimilarity =
    current.workToRestRatio != null && candidate.workToRestRatio != null
      ? ratioSimilarity(current.workToRestRatio, candidate.workToRestRatio)
      : 0.5;

  const score =
    zoneMatch * WEIGHTS.zoneMatch +
    durationBucketMatch * WEIGHTS.durationBucketMatch +
    repCountSimilarity * WEIGHTS.repCountSimilarity +
    workVolumeSimilarity * WEIGHTS.workVolumeSimilarity +
    recoverySimilarity * WEIGHTS.recoverySimilarity;

  let tier: ComparabilityResult["tier"] = score >= 0.75 ? "high" : score >= 0.5 ? "moderate" : "excluded";
  const guardrailsApplied: ComparabilityGuardrail[] = [];

  if (current.workToRestRatio != null && candidate.workToRestRatio != null) {
    const ratio = Math.max(current.workToRestRatio, candidate.workToRestRatio) / Math.min(current.workToRestRatio, candidate.workToRestRatio);
    if (ratio > RECOVERY_MISMATCH_RATIO) {
      guardrailsApplied.push("recovery_mismatch");
      if (tier === "high") tier = "moderate";
    }
  }

  if (current.elevationGainM != null && candidate.elevationGainM != null && current.totalDistanceM && candidate.totalDistanceM) {
    const elevationA = current.elevationGainM / (current.totalDistanceM / 1000);
    const elevationB = candidate.elevationGainM / (candidate.totalDistanceM / 1000);
    if (elevationA > 0 && elevationB > 0) {
      const ratio = Math.min(elevationA, elevationB) / Math.max(elevationA, elevationB);
      if (ratio < ELEVATION_MISMATCH_RATIO) {
        guardrailsApplied.push("elevation_mismatch");
        if (tier === "high") tier = "moderate";
      }
    }
  }

  return { score, tier, guardrailsApplied, breakdown: { zoneMatch, durationBucketMatch, repCountSimilarity, workVolumeSimilarity, recoverySimilarity } };
}
