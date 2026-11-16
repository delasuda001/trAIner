import { describe, expect, it } from "vitest";
import { activityAnalysisResponseSchema, debriefLlmOutputSchema, conversationResponseSchema, performanceProfileSchema } from "./schemas";

const validVerdictEvidence = [{ metric: "pace_cv_work_segments" as const, currentValue: 2, comparisonValue: null, unit: "%" as const, direction: "n/a" as const, label: "Variation d'allure de 2 % sur les segments analysés." }];

const validDebrief = {
  level1: { verdict: "well_executed" as const, verdictEvidence: validVerdictEvidence, notableVsHistory: null, mainFocus: "Maintenir cette régularité.", nextExperiment: null },
  summary: "ok",
  observed_facts: ["Allure stable"],
  historical_comparison: null,
  zone_classification_summary: "Zones basées sur l'allure seuil calculée 4:00/km.",
  technical_recommendations: [],
  next_session_pace_guidance: null,
  hypotheses: [],
  limitations: [],
  next_steps: [],
  safety_note: null,
};

describe("activityAnalysisResponseSchema (contrat de débrief v1.4)", () => {
  it("accepte un payload complet avec un niveau 1 structuré", () => {
    expect(activityAnalysisResponseSchema.safeParse(validDebrief).success).toBe(true);
  });

  it("strippe un ancien champ retiré du contrat (compat ascendante)", () => {
    const parsed = activityAnalysisResponseSchema.parse({ ...validDebrief, questions_to_consider: ["obsolète"], key_takeaways: ["ancien format"] });
    expect(parsed).not.toHaveProperty("questions_to_consider");
    expect(parsed).not.toHaveProperty("key_takeaways");
  });

  it("rejette un payload au format <=1.3 (sans level1, avec key_takeaways)", () => {
    const legacy = { ...validDebrief, key_takeaways: ["Séance réussie."] } as Record<string, unknown>;
    delete legacy.level1;
    expect(activityAnalysisResponseSchema.safeParse(legacy).success).toBe(false);
  });

  it("exige un verdict parmi les 4 valeurs autorisées et au moins une preuve", () => {
    expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, level1: { ...validDebrief.level1, verdict: "invalide" } }).success).toBe(false);
    expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, level1: { ...validDebrief.level1, verdictEvidence: [] } }).success).toBe(false);
    for (const verdict of ["well_executed", "partly_successful", "miscalibrated", "not_evaluable"] as const) {
      expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, level1: { ...validDebrief.level1, verdict } }).success).toBe(true);
    }
  });

  it("notableVsHistory/mainFocus/nextExperiment sont chacun nullables (aucun signal fort n'est un état normal)", () => {
    expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, level1: { ...validDebrief.level1, notableVsHistory: null, mainFocus: null, nextExperiment: null } }).success).toBe(true);
  });

  it("rejette un débrief incomplet", () => {
    expect(activityAnalysisResponseSchema.safeParse({ summary: "incomplet" }).success).toBe(false);
  });
});

describe("debriefLlmOutputSchema (schéma soumis à Gemini)", () => {
  it("n'expose ni verdict ni verdictEvidence au LLM", () => {
    const shape = debriefLlmOutputSchema.shape.level1.shape;
    expect(shape).not.toHaveProperty("verdict");
    expect(shape).not.toHaveProperty("verdictEvidence");
  });

  it("accepte le narratif seul, sans verdict", () => {
    const narrativeOnly = { ...validDebrief, level1: { notableVsHistory: null, mainFocus: "test", nextExperiment: null } };
    expect(debriefLlmOutputSchema.safeParse(narrativeOnly).success).toBe(true);
  });
});

describe("performanceProfileSchema", () => {
  it("valide un profil agrégé", () => {
    const profile = {
      generatedAt: "2026-09-09T00:00:00.000Z",
      estimateWindowWeeks: 20,
      thresholdPaceMinKm: "4:05",
      thresholdConfidence: "moderate" as const,
      thresholdBiasHint: null,
      thresholdFreshnessStale: false,
      thresholdStalePointCount: 0,
      thresholdOldestRetainedPointWeeks: null,
      thresholdStaleMessage: null,
      missingDurationZones: ["long" as const],
      bestEfforts: [{ durationS: 600, paceMinKm: "3:58", meanHeartRateBpm: 172, activityId: "i1", activityDate: "2026-08-01T00:00:00.000Z", status: "used" as const, rejectionReason: null }],
      weeklyVolume: { recentAverageKm: 42, priorAverageKm: 39, trend: "+8 %" },
      recentKeyTakeaways: ["Bonne régularité"],
      activitiesWithStreamSummary: 4,
      activitiesWithStreamSummaryInWindow: 3,
      totalRunningActivities: 12,
    };
    expect(performanceProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("rejette une confiance de seuil inconnue", () => {
    expect(performanceProfileSchema.safeParse({ thresholdConfidence: "excellent" }).success).toBe(false);
  });
});

describe("conversationResponseSchema", () => {
  it("rejette une réponse conversationnelle incomplète", () => {
    expect(conversationResponseSchema.safeParse({ summary: "incomplet" }).success).toBe(false);
  });
});
