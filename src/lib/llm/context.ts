import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client";
import { createActivityContextRepository } from "../db/repositories/activity-context-repository";
import { createAthleteContextRepository } from "../db/repositories/athlete-context-repository";
import { createGoalRepository } from "../db/repositories/goal-repository";
import { createSyncedActivityRepository } from "../db/repositories/synced-activity-repository";
import { createActivityDetailCacheRepository } from "../db/repositories/activity-detail-cache-repository";
import { loadActivityDetail } from "../activities/detail";
import { estimateThreshold } from "../analysis/thresholds";
import { aggregateCachedEfforts, toThresholdInput } from "../analysis/threshold-basis";
import { buildThresholdStaleMessage } from "../analysis/confidence-banner";
import { classifySegmentInZone } from "../analysis/zones";
import { segmentActivity } from "../analysis/segmentation";
import { buildSessionSignature, computeComparability, type SessionSignature } from "../analysis/session-signature";
import { resolveDeclaredReferenceSpeedMps } from "../analysis/declared-reference";
import { classifySegmentRoles } from "../analysis/segment-roles";
import { classifySessionVariationProfile } from "../analysis/variation-profile";
import { assessSessionRegularity } from "../analysis/regularity";
import { classifySessionVerdict } from "../analysis/verdict";
import { parseJson, athleteContextSchema, cachedIntervalsSchema } from "../db/contracts";
import type { AthleteContext } from "../db/contracts";
import type { SyncedActivity } from "../db/types";
import { buildPerformanceProfile } from "../analysis/performance-profile";
import type { ActivityAnalysisContext, HistoricalComparison } from "./schemas";

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type ComparisonThresholdSource = "dynamic" | "declared_reference" | "none";

/**
 * Résout la vitesse de référence utilisée par la comparaison historique
 * structurée, en 3 cas explicites (jamais de repli silencieux vers une
 * comparaison d'allure brute quand aucune des deux n'est exploitable — ce
 * cas est traité par l'appelant, pas ici) :
 * 1. seuil dynamique exploitable ;
 * 2. seuil dynamique insuffisant, référence déclarée exploitable ;
 * 3. ni l'un ni l'autre.
 */
export function resolveComparisonThresholdSpeedMps(
  criticalSpeedMps: number | null,
  confidenceLevel: "insufficient" | "low" | "moderate" | "good",
  performanceReferences: ReadonlyArray<{ value: string }> | undefined
): { speedMps: number | null; source: ComparisonThresholdSource } {
  if (criticalSpeedMps != null && confidenceLevel !== "insufficient") {
    return { speedMps: criticalSpeedMps, source: "dynamic" };
  }
  const declaredSpeedMps = resolveDeclaredReferenceSpeedMps(performanceReferences);
  if (declaredSpeedMps != null) {
    return { speedMps: declaredSpeedMps, source: "declared_reference" };
  }
  return { speedMps: null, source: "none" };
}

export function getWorkRepBucket(durationS: number): "short" | "medium" | "long" {
  if (durationS < 90) return "short";
  if (durationS <= 240) return "medium";
  return "long";
}

/**
 * Comparaison historique d'une séance structurée, fondée sur des signatures
 * de séance réellement mesurées (session-signature.ts) — jamais sur des
 * caractéristiques fabriquées. `candidates` ne doit contenir que des
 * signatures `signatureQuality: "measured"` (les candidats sans cache de
 * détail local sont déjà exclus par l'appelant, cf. buildActivityAnalysisContext).
 */
export function buildHistoricalComparisonForWorkout(
  current: SessionSignature,
  candidates: SessionSignature[],
  thresholdSource: "dynamic" | "declared_reference"
): HistoricalComparison {
  const usedDeclaredReferenceFallback = thresholdSource === "declared_reference";

  const scored = candidates
    .map((candidate) => ({ candidate, comparability: computeComparability(current, candidate) }))
    .filter((entry): entry is { candidate: SessionSignature; comparability: NonNullable<ReturnType<typeof computeComparability>> } => entry.comparability != null && entry.comparability.tier !== "excluded");

  if (scored.length === 0) {
    return {
      comparableActivitiesCount: 0,
      recentTrendDays: 112,
      insufficientDataReason: "aucune séance comparable trouvée pour cette zone et ce type de répétition (structure réellement mesurée) : comparaison historique non fiable.",
      paceDeltaPct: null,
      hrDeltaBpm: null,
      cadenceDeltaSpm: null,
      observations: ["aucune séance comparable trouvée dans la fenêtre historique pour cette zone et ce type de répétition."],
      usedDeclaredReferenceFallback,
      comparabilityBreakdown: null,
    };
  }

  const tierRank = (tier: "high" | "moderate" | "excluded") => (tier === "high" ? 0 : tier === "moderate" ? 1 : 2);
  const sorted = [...scored].sort((left, right) => {
    if (tierRank(left.comparability.tier) !== tierRank(right.comparability.tier)) return tierRank(left.comparability.tier) - tierRank(right.comparability.tier);
    if (left.comparability.guardrailsApplied.length !== right.comparability.guardrailsApplied.length) return left.comparability.guardrailsApplied.length - right.comparability.guardrailsApplied.length;
    return new Date(right.candidate.activityDate).getTime() - new Date(left.candidate.activityDate).getTime();
  });

  const mostRecent = sorted[0];
  const currentPercent = current.averagePercentOfThreshold;
  const recentPercent = mostRecent.candidate.averagePercentOfThreshold;
  const paceDeltaPct = currentPercent != null && recentPercent != null ? ((currentPercent - recentPercent) / recentPercent) * 100 : null;

  const values = sorted.map((entry) => entry.candidate.averagePercentOfThreshold).filter((value): value is number => value != null);
  const historicalAverage = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const observations = [
    `${sorted.length} ${sorted.length > 1 ? "séances" : "séance"} comparable${sorted.length > 1 ? "s" : ""} détectée${sorted.length > 1 ? "s" : ""} (structure réellement mesurée) pour cette zone et ce format de répétition.`,
    historicalAverage != null && currentPercent != null
      ? `Moyenne historique sur cette base : ${historicalAverage.toFixed(1)} % de seuil.`
      : "Moyenne historique indisponible pour cette base de comparaison.",
    paceDeltaPct != null
      ? `Évolution vs la plus récente : ${paceDeltaPct.toFixed(1)} %.`
      : "Évolution historique non calculable.",
  ];
  if (usedDeclaredReferenceFallback) {
    observations.push("Comparaison basée sur votre repère de performance déclaré (seuil calculé insuffisant), jamais une estimation automatique.");
  }
  if (mostRecent.comparability.guardrailsApplied.includes("recovery_mismatch")) {
    observations.push("Récupération très différente entre les séances comparées : à interpréter avec prudence.");
  }
  if (mostRecent.comparability.guardrailsApplied.includes("elevation_mismatch")) {
    observations.push("Dénivelé très différent entre les séances comparées : à interpréter avec prudence.");
  }

  return {
    comparableActivitiesCount: sorted.length,
    recentTrendDays: 112,
    insufficientDataReason: sorted.length < 2 ? "Seulement 1 séance comparable disponible (structure mesurée) ; interprétation prudente." : null,
    paceDeltaPct,
    hrDeltaBpm: null,
    cadenceDeltaSpm: null,
    observations,
    usedDeclaredReferenceFallback,
    comparabilityBreakdown: sorted.map((entry) => ({
      activityId: entry.candidate.activityId,
      score: entry.comparability.score,
      tier: entry.comparability.tier,
      guardrailsApplied: entry.comparability.guardrailsApplied,
    })),
  };
}

/**
 * Détecte une structure travail/récupération plausible sans aucun seuil de
 * référence, uniquement à partir de la variabilité brute des vitesses de
 * segment (ratio vitesse max/min). Utilisée UNIQUEMENT pour éviter qu'une
 * séance manifestement structurée (cf. §4.2 cas 3 : ni seuil dynamique, ni
 * référence déclarée) ne retombe silencieusement sur la comparaison d'allure
 * brute réservée aux séances réellement continues — jamais pour calculer un
 * pourcentage de seuil ou une zone.
 */
function hasPlausibleWorkStructureWithoutThreshold(segments: Array<{ averageSpeedMps: number | null }>): boolean {
  const speeds = segments.map((segment) => segment.averageSpeedMps).filter((value): value is number => value != null && value > 0);
  if (speeds.length < 3) return false;
  const max = Math.max(...speeds);
  const min = Math.min(...speeds);
  return min > 0 && max / min >= 1.3;
}

/**
 * Orchestration complète de la comparaison historique d'une séance :
 * résolution de la vitesse de référence (3 cas, cf.
 * resolveComparisonThresholdSpeedMps), décision structuré/continu à partir
 * de CETTE résolution (jamais du seul seuil dynamique brut — un repère
 * déclaré doit pouvoir révéler une structure que le seuil dynamique seul ne
 * verrait pas), puis construction des signatures (courante + candidats
 * disposant d'un cache de détail local, jamais un nouveau fetch) et scoring
 * de comparabilité.
 */
async function buildHistoricalComparisonForActivity(input: {
  database: AppDatabase;
  activityId: string;
  activityDate: string;
  sportType: string;
  totalDistanceM: number | null;
  totalMovingTimeS: number | null;
  averageSpeedMps: number | null;
  elevationGainM: number | null;
  segmented: ReturnType<typeof segmentActivity>;
  thresholdEst: ReturnType<typeof estimateThreshold>;
  athleteContext: AthleteContext | null;
  recentActivities: SyncedActivity[];
}): Promise<HistoricalComparison> {
  const comparisonThreshold = resolveComparisonThresholdSpeedMps(
    input.thresholdEst.criticalSpeedMps,
    input.thresholdEst.confidenceLevel,
    input.athleteContext?.performanceReferences
  );

  const continuousFallback = (): HistoricalComparison =>
    toComparableActivitiesHistory(
      { distanceM: input.totalDistanceM, movingTimeS: input.totalMovingTimeS, averageSpeedMps: input.averageSpeedMps },
      input.recentActivities.map((candidate) => ({
        distanceM: candidate.distanceM ?? null,
        movingTimeS: candidate.movingTimeS ?? null,
        averageSpeedMps: candidate.averageSpeedMps ?? null,
        sportType: candidate.sportType ?? null,
        startDate: candidate.startDate,
      }))
    );

  if (comparisonThreshold.speedMps == null) {
    // Cas 3 (§4.2) : ni seuil dynamique ni référence déclarée. On ne bascule
    // en comparaison structurée "impossible" QUE si la séance a une
    // structure plausible sans threshold — sinon c'est une vraie séance
    // continue, traitée normalement.
    if (!hasPlausibleWorkStructureWithoutThreshold(input.segmented.segments)) return continuousFallback();
    return {
      comparableActivitiesCount: 0,
      recentTrendDays: 112,
      insufficientDataReason: "aucune base de vitesse de référence exploitable (ni seuil dynamique, ni repère déclaré) : comparaison par pourcentage de seuil impossible",
      paceDeltaPct: null,
      hrDeltaBpm: null,
      cadenceDeltaSpm: null,
      observations: [],
      usedDeclaredReferenceFallback: false,
      comparabilityBreakdown: null,
    };
  }

  const currentSignature = buildSessionSignature({
    activityId: input.activityId,
    activityDate: input.activityDate,
    sportType: input.sportType,
    totalDistanceM: input.totalDistanceM,
    totalMovingTimeS: input.totalMovingTimeS,
    elevationGainM: input.elevationGainM,
    segmented: input.segmented,
    thresholdSpeedMps: comparisonThreshold.speedMps,
  });

  if (currentSignature.workSegmentCount === 0) return continuousFallback();

  const thresholdSource = comparisonThreshold.source as "dynamic" | "declared_reference";
  const detailCacheRepo = createActivityDetailCacheRepository(input.database);
  const candidateSignatures: SessionSignature[] = [];
  let candidatesWithoutCache = 0;

  for (const candidate of input.recentActivities) {
    const cached = await detailCacheRepo.findByActivityId(candidate.intervalsActivityId).catch(() => undefined);
    if (!cached?.intervalsJson) {
      candidatesWithoutCache += 1;
      continue;
    }
    let candidateLaps: unknown[];
    try {
      candidateLaps = parseJson(cachedIntervalsSchema, cached.intervalsJson).intervals;
    } catch {
      candidatesWithoutCache += 1;
      continue;
    }
    const candidateSegmented = segmentActivity({ laps: candidateLaps as never, streams: undefined }, "adaptive");
    candidateSignatures.push(
      buildSessionSignature({
        activityId: candidate.intervalsActivityId,
        activityDate: candidate.startDate,
        sportType: candidate.sportType ?? null,
        totalDistanceM: candidate.distanceM ?? null,
        totalMovingTimeS: candidate.movingTimeS ?? null,
        elevationGainM: candidate.elevationGainM ?? null,
        segmented: candidateSegmented,
        thresholdSpeedMps: comparisonThreshold.speedMps,
      })
    );
  }

  const comparison = buildHistoricalComparisonForWorkout(currentSignature, candidateSignatures, thresholdSource);

  // Cf. UX §7 du plan : distinguer "pas de séance comparable" de "des
  // candidats existent mais leurs intervalles ne sont pas encore en cache".
  if (comparison.comparableActivitiesCount === 0 && candidatesWithoutCache > 0) {
    return {
      ...comparison,
      insufficientDataReason:
        "Certaines séances récentes pourraient être comparables, mais leurs intervalles ne sont pas encore préparés localement. La comparaison détaillée sera enrichie à mesure que ces séances sont consultées ou préparées explicitement.",
    };
  }

  return comparison;
}

function toComparableActivitiesHistory(
  activity: { distanceM: number | null; movingTimeS: number | null; averageSpeedMps: number | null },
  candidates: Array<{ distanceM: number | null; movingTimeS: number | null; averageSpeedMps: number | null; sportType: string | null; startDate: string; }>
) {
  const targetDistance = safeNumber(activity.distanceM);
  const targetDuration = safeNumber(activity.movingTimeS);
  const comparable = candidates.filter((candidate) => {
    const candidateDistance = safeNumber(candidate.distanceM);
    const candidateDuration = safeNumber(candidate.movingTimeS);
    if (candidateDistance == null || candidateDuration == null) return false;
    if (candidate.sportType && !/run|running/i.test(candidate.sportType)) return false;

    const distanceRatio = targetDistance == null ? 1 : Math.min(candidateDistance, targetDistance) / Math.max(candidateDistance, targetDistance);
    const durationRatio = targetDuration == null ? 1 : Math.min(candidateDuration, targetDuration) / Math.max(candidateDuration, targetDuration);

    return distanceRatio >= 0.7 && durationRatio >= 0.7;
  });

  if (comparable.length === 0) {
    return {
      comparableActivitiesCount: 0,
      recentTrendDays: 90,
      insufficientDataReason: "Aucune activité comparable sur les 90 derniers jours pour valider l’écart historique.",
      paceDeltaPct: null,
      hrDeltaBpm: null,
      cadenceDeltaSpm: null,
      observations: [],
      usedDeclaredReferenceFallback: false,
      comparabilityBreakdown: null,
    };
  }

  const speeds = comparable.map((candidate) => safeNumber(candidate.averageSpeedMps)).filter((value): value is number => value != null);
  const averageHistoricalSpeed = speeds.length > 0 ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : null;
  const paceDeltaPct = averageHistoricalSpeed != null && safeNumber(activity.averageSpeedMps) != null
    ? ((safeNumber(activity.averageSpeedMps)! - averageHistoricalSpeed) / averageHistoricalSpeed) * 100
    : null;

  return {
    comparableActivitiesCount: comparable.length,
    recentTrendDays: 90,
    insufficientDataReason: comparable.length < 3 ? "Seulement 1 à 2 sorties comparables disponibles ; l’écart historique reste faible et doit être interprété avec prudence." : null,
    paceDeltaPct,
    hrDeltaBpm: null,
    cadenceDeltaSpm: null,
    observations: comparable.length >= 3
      ? [
          `${comparable.length} activités comparables détectées dans la fenêtre des 90 jours.`,
          averageHistoricalSpeed != null ? `Moyenne de vitesse historique : ${averageHistoricalSpeed.toFixed(2)} m/s.` : "Moyenne de vitesse historique indisponible.",
        ]
      : [`${comparable.length} activité(s) comparable(s) détectée(s) dans la fenêtre des 90 jours.`],
    usedDeclaredReferenceFallback: false,
    comparabilityBreakdown: null,
  };
}

export async function buildActivityAnalysisContext(
  activityId: string,
  database: AppDatabase
): Promise<ActivityAnalysisContext> {
  const syncedRepo = createSyncedActivityRepository(database);
  const synced = await syncedRepo.findByExternalId(activityId);
  if (!synced) throw new Error(`Activity ${activityId} not found in local database`);

  const detail = await loadActivityDetail(activityId, randomUUID(), database);

  const { activity, intervals } = detail;
  const typedActivity = activity as {
    start_date: string;
    start_date_local?: string;
    name?: string;
    type?: string;
    distance?: number | null;
    moving_time?: number | null;
    elapsed_time?: number | null;
    average_speed?: number | null;
    average_heartrate?: number | null;
    average_cadence?: number | null;
    total_elevation_gain?: number | null;
  };

  const typedIntervals = (intervals as unknown[]).map((interval: unknown) => {
    const i = interval as {
      name?: string | null;
      distance?: number | null;
      moving_time?: number | null;
      elapsed_time?: number | null;
      average_speed?: number | null;
      average_heartrate?: number | null;
      average_cadence?: number | null;
    };
    return {
      name: i.name ?? null,
      distanceM: i.distance ?? null,
      movingTimeS: i.moving_time ?? null,
      averageSpeedMps: i.average_speed ?? null,
      averageHeartRateBpm: i.average_heartrate ?? null,
      averageCadenceSpm: i.average_cadence ?? null,
    };
  });

  const segmented = segmentActivity(
    { laps: intervals as never, streams: undefined },
    "adaptive"
  );

  // Convert pace for threshold: m/s to min:sec format
  function formatPace(speedMps: number | null): string | null {
    if (!speedMps || speedMps <= 0) return null;
    const secPerKm = 1000 / speedMps;
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  // Estimation de seuil pour CE débrief : mêmes résumés de streams en cache et
  // même fenêtre temporelle que le profil de performance (aucun fetch de
  // streams ici ; si le cache est vide, la confiance reste "insufficient").
  // `thresholdBasis` est calculé une seule fois puis partagé avec le profil.
  const contextNow = new Date();
  const thresholdBasis = await aggregateCachedEfforts(database, contextNow);
  const thresholdEst = estimateThreshold(toThresholdInput(thresholdBasis));

  const segmentZones = segmented.segments.map((seg, idx) => ({
    segmentIndex: idx,
    ...classifySegmentInZone(seg.averageSpeedMps, thresholdEst.criticalSpeedMps),
  }));

  // Prepare activity context (user-provided)
  const activityCtxRepo = createActivityContextRepository(database);
  const userContext = await activityCtxRepo.findByActivityId(activityId);

  // Prepare athlete context
  const athleteCtxRepo = createAthleteContextRepository(database);
  const athleteCtxVersion = await athleteCtxRepo.findActive();
  const athleteContext = athleteCtxVersion
    ? parseJson(athleteContextSchema, athleteCtxVersion.contextJson)
    : null;

  // Prepare active goals
  const goalRepo = createGoalRepository(database);
  const activeGoals = await goalRepo.findByStatus("active");

  const recentWindowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recentActivities = await createSyncedActivityRepository(database).findByPeriod(recentWindowStart, new Date().toISOString(), 20);

  const historicalComparison: ActivityAnalysisContext["historicalComparison"] = await buildHistoricalComparisonForActivity({
    database,
    activityId,
    activityDate: typedActivity.start_date,
    sportType: typedActivity.type ?? "running",
    totalDistanceM: typedActivity.distance ?? null,
    totalMovingTimeS: typedActivity.moving_time ?? null,
    averageSpeedMps: typedActivity.average_speed ?? null,
    elevationGainM: typedActivity.total_elevation_gain ?? null,
    segmented,
    thresholdEst,
    athleteContext,
    recentActivities,
  });

  const declaredReferenceCount = athleteContext?.performanceReferences?.length ?? 0;
  const usedDeclaredReferenceFallback =
    (thresholdEst.confidenceLevel === "insufficient" || thresholdEst.confidenceLevel === "low") &&
    declaredReferenceCount > 0;

  const newestRetainedMs = thresholdBasis.efforts.length > 0
    ? Math.max(...thresholdBasis.efforts.map((effort) => new Date(effort.activityDateIso).getTime()))
    : null;
  const lastValidDaysAgo = newestRetainedMs != null
    ? Math.round((contextNow.getTime() - newestRetainedMs) / 86_400_000)
    : null;

  const staleMessage = buildThresholdStaleMessage({
    validPointCount: thresholdEst.validPointCount,
    stalePointCount: thresholdEst.stalePointCount,
    oldestRetainedPointWeeks: thresholdEst.oldestRetainedPointWeeks,
    windowWeeks: thresholdBasis.windowWeeks,
  });

  const thresholdEstimate = {
    criticalSpeedMps: thresholdEst.criticalSpeedMps,
    thresholdPaceMinKm: formatPace(thresholdEst.criticalSpeedMps),
    dprimM: thresholdEst.dprimM,
    validPointCount: thresholdEst.validPointCount,
    confidenceLevel: thresholdEst.confidenceLevel,
    basis: "recent_history" as const,
    windowWeeks: thresholdBasis.windowWeeks,
    usedDeclaredReferenceFallback,
    retainedPoints: thresholdBasis.efforts.map((effort) => ({
      durationS: effort.durationS,
      activityId: effort.activityId,
      activityDate: effort.activityDateIso,
    })),
    coverageByZone: thresholdEst.coverageByZone,
    missingZones: thresholdEst.missingZones,
    suggestedSessions: thresholdEst.sessionSuggestionsForMissingZones.map((suggestion, index) => ({
      missingZone: thresholdEst.missingZones[index] ?? thresholdEst.missingZones[0] ?? "short",
      suggestion,
    })),
    biasHint: thresholdEst.biasIndicator,
    staleWarning: {
      isStale: thresholdEst.freshnessAlert,
      lastValidDaysAgo,
      stalePointCount: thresholdEst.stalePointCount,
      oldestRetainedPointWeeks: thresholdEst.oldestRetainedPointWeeks,
      message: staleMessage,
    },
    rejectedPoints: thresholdEst.rejectedPoints.map((point) => ({
      durationS: point.durationS,
      reason: point.reason,
    })),
  };

  const performanceProfile = await buildPerformanceProfile(database, contextNow, thresholdBasis);

  // Signaux de verdict (niveau 1) : la même résolution de seuil que la
  // comparaison historique (3 cas, §4.2) sert à rôler les segments de CETTE
  // séance pour la régularité et le profil de variation. `sessionIntent`
  // reste `null` tant que sa capture n'est pas branchée (cf. plan §3.3) —
  // état normal, pas une donnée manquante à combler.
  const verdictComparisonThreshold = resolveComparisonThresholdSpeedMps(
    thresholdEst.criticalSpeedMps,
    thresholdEst.confidenceLevel,
    athleteContext?.performanceReferences
  );
  const verdictRoledSegments = classifySegmentRoles(segmented.segments, verdictComparisonThreshold.speedMps).segments;
  const verdictSignals = classifySessionVerdict({
    regularity: assessSessionRegularity(verdictRoledSegments),
    variationProfile: classifySessionVariationProfile(verdictRoledSegments),
    sessionIntent: null,
    historicalComparison: historicalComparison
      ? { comparableActivitiesCount: historicalComparison.comparableActivitiesCount, paceDeltaPct: historicalComparison.paceDeltaPct }
      : null,
    thresholdConfidence: thresholdEst.confidenceLevel,
  });

  return {
    activityId,
    performanceProfile,
    activityMetadata: {
      startDate: typedActivity.start_date,
      name: typedActivity.name ?? null,
      sportType: typedActivity.type ?? "running",
      distanceM: typedActivity.distance ?? null,
      movingTimeS: typedActivity.moving_time ?? null,
      averageSpeedMps: typedActivity.average_speed ?? null,
      averageHeartRateBpm: typedActivity.average_heartrate ?? null,
      maxHeartRateBpm: synced.maxHeartRateBpm ?? null,
      averageCadenceSpm: typedActivity.average_cadence ?? null,
      elevationGainM: typedActivity.total_elevation_gain ?? null,
    },
    intervals: typedIntervals,
    segmentation: {
      strategy: "adaptive",
      segments: segmented.segments.map((seg, idx) => ({
        index: idx,
        durationS: seg.durationS,
        distanceM: seg.distanceM,
        averageSpeedMps: seg.averageSpeedMps,
      })),
    },
    thresholdEstimate,
    segmentZones,
    historicalComparison,
    verdictSignals,
    activeGoals: activeGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      type: goal.type,
      targetValue: goal.targetValue,
      targetUnit: goal.targetUnit,
    })),
    athleteContext,
    userContextForThisActivity: userContext
      ? {
          goalForThisSession: userContext.sessionGoal,
          unusualFatigue: userContext.unusualFatigue === 1,
          painFlag: userContext.painFlag === 1,
          note: userContext.note,
        }
      : null,
    qualityWarnings: segmented.limitations,
  };
}
