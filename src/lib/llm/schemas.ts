import { z } from "zod";
import { athleteContextSchema } from "../db/contracts";

export const thresholdEstimateSchema = z.object({
  criticalSpeedMps: z.number().nullable(),
  thresholdPaceMinKm: z.string().nullable(),
  dprimM: z.number().nullable(),
  validPointCount: z.number().int(),
  confidenceLevel: z.enum(["insufficient", "low", "moderate", "good"]),
  /** Origine de la valeur : toujours l'historique récent (jamais cette seule séance). */
  basis: z.literal("recent_history"),
  /** Fenêtre (semaines) des efforts qui alimentent l'estimation. */
  windowWeeks: z.number().int().positive(),
  /**
   * true quand la confiance est insufficient/low ET qu'une référence de
   * performance déclarée existe dans le contexte athlète : le modèle DOIT
   * alors classer les zones sur cette référence et le dire explicitement.
   */
  usedDeclaredReferenceFallback: z.boolean(),
  /** Activités et dates des points retenus pour l'estimation. */
  retainedPoints: z.array(
    z.object({
      durationS: z.number().int().positive(),
      activityId: z.string(),
      activityDate: z.string(),
    })
  ),
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
    stalePointCount: z.number().int().nonnegative(),
    oldestRetainedPointWeeks: z.number().nonnegative().nullable(),
    message: z.string().nullable(),
  }),
  rejectedPoints: z.array(
    z.object({
      durationS: z.number(),
      reason: z.string(),
    })
  ),
});

/**
 * Profil de performance multi-activités, dérivé des résumés de streams en
 * cache, de la tendance de volume et des débriefs récents. Agrégats
 * uniquement : aucune série brute, aucun score de charge/fatigue.
 */
export const performanceProfileSchema = z.object({
  generatedAt: z.string(),
  /** Fenêtre (semaines) des résumés qui participent à l'estimation active de seuil. */
  estimateWindowWeeks: z.number().int().positive(),
  thresholdPaceMinKm: z.string().nullable(),
  thresholdConfidence: z.enum(["insufficient", "low", "moderate", "good"]),
  thresholdBiasHint: z.string().nullable(),
  thresholdFreshnessStale: z.boolean(),
  /** Nombre de points retenus datant de plus de 8 semaines (péremption). */
  thresholdStalePointCount: z.number().int().nonnegative(),
  thresholdOldestRetainedPointWeeks: z.number().nonnegative().nullable(),
  /** Message de péremption en français, `null` si aucun point retenu périmé. Affiché indépendamment de la confiance. */
  thresholdStaleMessage: z.string().nullable(),
  missingDurationZones: z.array(z.enum(["short", "medium", "long"])),
  bestEfforts: z.array(
    z.object({
      durationS: z.number().int().positive(),
      paceMinKm: z.string(),
      meanHeartRateBpm: z.number().nullable(),
      activityId: z.string(),
      /** Date (ISO) de l'activité source de ce meilleur effort. */
      activityDate: z.string(),
      /** `used` = retenu par l'estimation de seuil ; `rejected` = écarté (filtre intensité/plausibilité). */
      status: z.enum(["used", "rejected"]),
      rejectionReason: z.string().nullable(),
    })
  ),
  weeklyVolume: z.object({
    recentAverageKm: z.number().nullable(),
    priorAverageKm: z.number().nullable(),
    trend: z.string().nullable(),
  }),
  recentKeyTakeaways: z.array(z.string()),
  activitiesWithStreamSummary: z.number().int().nonnegative(),
  activitiesWithStreamSummaryInWindow: z.number().int().nonnegative(),
  totalRunningActivities: z.number().int().nonnegative(),
});

export type PerformanceProfile = z.infer<typeof performanceProfileSchema>;

export const segmentZoneSchema = z.object({
  segmentIndex: z.number(),
  zone: z.enum(["recovery", "easy", "tempo", "threshold", "vo2max", "anaerobic"]).nullable(),
  percentOfThreshold: z.number().nullable(),
});

export const comparabilityGuardrailSchema = z.enum(["recovery_mismatch", "elevation_mismatch"]);

export const comparabilityBreakdownEntrySchema = z.object({
  activityId: z.string(),
  score: z.number(),
  tier: z.enum(["high", "moderate", "excluded"]),
  guardrailsApplied: z.array(comparabilityGuardrailSchema),
});

export const historicalComparisonSchema = z.object({
  comparableActivitiesCount: z.number(),
  recentTrendDays: z.number(),
  insufficientDataReason: z.string().nullable(),
  paceDeltaPct: z.number().nullable(),
  hrDeltaBpm: z.number().nullable(),
  cadenceDeltaSpm: z.number().nullable(),
  observations: z.array(z.string()),
  /** true si la comparaison structurée s'appuie sur un repère déclaré (seuil calculé insuffisant), jamais présenté comme une estimation automatique. */
  usedDeclaredReferenceFallback: z.boolean().default(false),
  /** Détail par candidat retenu (score, tier, garde-fous), pour la transparence méthodologique du niveau 3. `null` en mode continu ou si aucun candidat mesuré. */
  comparabilityBreakdown: z.array(comparabilityBreakdownEntrySchema).nullable().default(null),
});

export type HistoricalComparison = z.infer<typeof historicalComparisonSchema>;

export const debriefVerdictSchema = z.enum(["well_executed", "partly_successful", "miscalibrated", "not_evaluable"]);

export const verdictEvidenceItemSchema = z.object({
  metric: z.enum([
    "pace_degradation_first_vs_second_half",
    "pace_cv_work_segments",
    "pace_delta_vs_comparable",
    "declared_intent_contradiction",
    "variation_profile_signal",
    "not_evaluable_reason",
  ]),
  currentValue: z.number(),
  comparisonValue: z.number().nullable(),
  unit: z.enum(["%", "s_per_km", "bpm", "ratio"]),
  direction: z.enum(["higher", "lower", "equal", "n/a"]),
  label: z.string(),
});

/** Calculé côté serveur par `classifySessionVerdict` (analysis/verdict.ts) — jamais soumis au LLM en écriture. */
export const level1VerdictSchema = z.object({
  verdict: debriefVerdictSchema,
  verdictEvidence: z.array(verdictEvidenceItemSchema).min(1),
});

/** Ce que le LLM est autorisé à produire : narratif uniquement, jamais le verdict lui-même. */
export const level1NarrativeSchema = z.object({
  notableVsHistory: z.string().nullable(),
  mainFocus: z.string().nullable(),
  nextExperiment: z.string().nullable(),
});

/** Objet final persisté : fusion serveur (verdict) + LLM (narratif), cf. route POST /api/activities/[id]/analysis. */
export const level1SynthesisSchema = level1VerdictSchema.merge(level1NarrativeSchema);

export type Level1Synthesis = z.infer<typeof level1SynthesisSchema>;
export type Level1Narrative = z.infer<typeof level1NarrativeSchema>;

export const activityAnalysisContextSchema = z.object({
  activityId: z.string(),
  performanceProfile: performanceProfileSchema.nullable().default(null),
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
  /** Verdict + preuves calculés côté serveur (analysis/verdict.ts) : le LLM les reçoit comme des faits, ne les produit ni ne les modifie jamais. */
  verdictSignals: level1VerdictSchema,
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
  level1: level1SynthesisSchema,
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
  next_steps: z.array(z.string()),
  safety_note: z.string().nullable(),
});

export type ActivityAnalysisResponse = z.infer<typeof activityAnalysisResponseSchema>;

/**
 * Schéma réellement soumis à Gemini pour le débrief : `level1` y est
 * remplacé par sa seule partie narrative (`level1NarrativeSchema`). Le
 * modèle ne voit jamais `verdict`/`verdictEvidence` dans le schéma qu'il
 * doit remplir — structurellement incapable de les produire ou de les
 * modifier (cf. Décision D4 du plan de consolidation).
 */
export const debriefLlmOutputSchema = activityAnalysisResponseSchema.omit({ level1: true }).extend({ level1: level1NarrativeSchema });
export type DebriefLlmOutput = z.infer<typeof debriefLlmOutputSchema>;

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
