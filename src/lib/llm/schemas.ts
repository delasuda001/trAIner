import { z } from "zod";
import { athleteContextSchema } from "../db/contracts";

export const thresholdEstimateSchema = z.object({
  criticalSpeedMps: z.number().nullable(),
  thresholdPaceMinKm: z.string().nullable(),
  dprimM: z.number().nullable(),
  validPointCount: z.number().int(),
  confidenceLevel: z.enum(["insufficient", "low", "moderate", "good"]),
  coverageByZone: z.object({
    short: z.boolean(),
    medium: z.boolean(),
    long: z.boolean(),
  }),
  missingZones: z.array(z.enum(["short", "medium", "long"])),
  suggestedSessions: z.array(
    z.object({
      missingZone: z.enum(["short", "medium", "long"]),
      suggestion: z.string(),
    })
  ),
  biasHint: z.string().nullable(),
  staleWarning: z.object({
    isStale: z.boolean(),
    lastValidDaysAgo: z.number().nullable(),
    message: z.string().nullable(),
  }),
  rejectedPoints: z.array(
    z.object({
      durationS: z.number(),
      reason: z.string(),
    })
  ),
});

export const segmentZoneSchema = z.object({
  segmentIndex: z.number(),
  zone: z.enum(["recovery", "easy", "tempo", "threshold", "vo2max", "anaerobic"]).nullable(),
  percentOfThreshold: z.number().nullable(),
});

export const historicalComparisonSchema = z.object({
  comparableActivitiesCount: z.number(),
  recentTrendDays: z.number(),
  insufficientDataReason: z.string().nullable(),
  paceDeltaPct: z.number().nullable(),
  hrDeltaBpm: z.number().nullable(),
  cadenceDeltaSpm: z.number().nullable(),
  observations: z.array(z.string()),
});

export const activityAnalysisContextSchema = z.object({
  activityId: z.string(),
  performanceProfile: z.object({
    summary: z.string(),
    recentHighlights: z.array(z.string()),
    volumeTrend: z.string().nullable(),
    thresholdEstimate: z.string().nullable(),
    keyTakeaways: z.array(z.string()),
  }).nullable().default(null),
  activityMetadata: z.object({
    startDate: z.string(),
    name: z.string().nullable(),
    sportType: z.string(),
    distanceM: z.number().nullable(),
    movingTimeS: z.number().nullable(),
    averageSpeedMps: z.number().nullable(),
    averageHeartRateBpm: z.number().nullable(),
    maxHeartRateBpm: z.number().nullable(),
    averageCadenceSpm: z.number().nullable(),
    elevationGainM: z.number().nullable(),
  }),
  intervals: z.array(
    z.object({
      name: z.string().nullable(),
      distanceM: z.number().nullable(),
      movingTimeS: z.number().nullable(),
      averageSpeedMps: z.number().nullable(),
      averageHeartRateBpm: z.number().nullable(),
      averageCadenceSpm: z.number().nullable(),
    })
  ),
  segmentation: z.object({
    strategy: z.enum(["lap", "thirds", "adaptive"]),
    segments: z.array(
      z.object({
        index: z.number(),
        durationS: z.number(),
        distanceM: z.number().nullable(),
        averageSpeedMps: z.number().nullable(),
      })
    ),
  }),
  thresholdEstimate: thresholdEstimateSchema,
  segmentZones: z.array(segmentZoneSchema),
  historicalComparison: historicalComparisonSchema.nullable(),
  activeGoals: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: z.string(),
      targetValue: z.number().nullable(),
      targetUnit: z.string().nullable(),
    })
  ),
  athleteContext: athleteContextSchema.nullable(),
  userContextForThisActivity: z
    .object({
      goalForThisSession: z.string().nullable(),
      unusualFatigue: z.boolean(),
      painFlag: z.boolean(),
      note: z.string().nullable(),
    })
    .nullable(),
  qualityWarnings: z.array(z.string()),
});

export type ActivityAnalysisContext = z.infer<typeof activityAnalysisContextSchema>;

export const activityAnalysisResponseSchema = z.object({
  key_takeaways: z.array(z.string()).min(1).max(3),
  summary: z.string(),
  observed_facts: z.array(z.string()),
  historical_comparison: z.string().nullable(),
  zone_classification_summary: z.string(),
  technical_recommendations: z.array(z.string()),
  next_session_pace_guidance: z
    .object({
      recommendedPaceMps: z.number().nullable(),
      recommendedPaceDisplay: z.string(),
      rationale: z.string(),
      adjustments: z.array(z.string()),
    })
    .nullable(),
  hypotheses: z.array(z.string()),
  limitations: z.array(z.string()),
  questions_to_consider: z.array(z.string()),
  next_steps: z.array(z.string()),
  safety_note: z.string().nullable(),
});

export type ActivityAnalysisResponse = z.infer<typeof activityAnalysisResponseSchema>;

export const conversationScopeSchema = z.object({
  kind: z.enum(["activity", "trend", "goal", "data_gap"]),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  activityIds: z.array(z.string()),
  goalId: z.string().nullable(),
});

export const conversationEvidenceSchema = z.object({
  activityId: z.string().nullable(),
  label: z.string(),
  value: z.string(),
});

export const conversationResponseSchema = z.object({
  summary: z.string(),
  observedFacts: z.array(z.string()),
  comparisons: z.array(z.string()),
  hypotheses: z.array(z.string()),
  limitations: z.array(z.string()),
  missingData: z.array(z.string()),
  evidence: z.array(conversationEvidenceSchema),
});

export type ConversationResponse = z.infer<typeof conversationResponseSchema>;
