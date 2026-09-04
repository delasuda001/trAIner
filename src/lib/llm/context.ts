import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client";
import { createActivityContextRepository } from "../db/repositories/activity-context-repository";
import { createAthleteContextRepository } from "../db/repositories/athlete-context-repository";
import { createGoalRepository } from "../db/repositories/goal-repository";
import { createSyncedActivityRepository } from "../db/repositories/synced-activity-repository";
import { loadActivityDetail } from "../activities/detail";
import { estimateThreshold } from "../analysis/thresholds";
import { classifySegmentInZone } from "../analysis/zones";
import { segmentActivity } from "../analysis/segmentation";
import { parseJson, athleteContextSchema } from "../db/contracts";
import type { ActivityAnalysisContext } from "./schemas";

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

  // Build threshold estimate from synced activity
  const thresholdInput = {
    effortsByDuration: [],
    globalMaxHeartRateBpm: synced.maxHeartRateBpm,
  };
  const thresholdEst = estimateThreshold(thresholdInput);

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

  // Prepare active goals
  const goalRepo = createGoalRepository(database);
  const activeGoals = await goalRepo.findByStatus("active");

  const recentWindowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recentActivities = await createSyncedActivityRepository(database).findByPeriod(recentWindowStart, new Date().toISOString(), 20);
  const historicalComparison = toComparableActivitiesHistory(
    { distanceM: typedActivity.distance ?? null, movingTimeS: typedActivity.moving_time ?? null, averageSpeedMps: typedActivity.average_speed ?? null },
    recentActivities.map((candidate) => ({
      distanceM: candidate.distanceM ?? null,
      movingTimeS: candidate.movingTimeS ?? null,
      averageSpeedMps: candidate.averageSpeedMps ?? null,
      sportType: candidate.sportType ?? null,
      startDate: candidate.startDate,
    }))
  );

  const thresholdEstimate = {
    criticalSpeedMps: thresholdEst.criticalSpeedMps,
    thresholdPaceMinKm: formatPace(thresholdEst.criticalSpeedMps),
    dprimM: thresholdEst.dprimM,
    validPointCount: thresholdEst.validPointCount,
    confidenceLevel: thresholdEst.confidenceLevel,
    coverageByZone: thresholdEst.coverageByZone,
    missingZones: thresholdEst.missingZones,
    suggestedSessions: thresholdEst.sessionSuggestionsForMissingZones.map((suggestion) => ({
      missingZone: thresholdEst.missingZones[0] ?? "short",
      suggestion,
    })),
    biasHint: thresholdEst.biasIndicator,
    staleWarning: {
      isStale: thresholdEst.freshnessAlert,
      lastValidDaysAgo: null,
      message: thresholdEst.freshnessAlert ? "No recent threshold data available." : null,
    },
    rejectedPoints: thresholdEst.rejectedPoints.map((point) => ({
      durationS: point.durationS,
      reason: point.reason,
    })),
  };

  return {
    activityId,
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
    activeGoals: activeGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      type: goal.type,
      targetValue: goal.targetValue,
      targetUnit: goal.targetUnit,
    })),
    athleteContext: athleteCtxVersion
      ? parseJson(
          athleteContextSchema,
          athleteCtxVersion.contextJson
        )
      : null,
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
