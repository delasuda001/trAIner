import { describe, expect, it } from "vitest";
import { activityAnalysisResponseSchema, conversationResponseSchema, performanceProfileSchema } from "./schemas";

const validDebrief = {
  key_takeaways: ["Séance régulière"],
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

describe("activityAnalysisResponseSchema (contrat de débrief v1.2)", () => {
  it("accepte un payload complet sans questions_to_consider", () => {
    expect(activityAnalysisResponseSchema.safeParse(validDebrief).success).toBe(true);
  });

  it("strippe questions_to_consider s'il est présent (compat ascendante)", () => {
    const parsed = activityAnalysisResponseSchema.parse({ ...validDebrief, questions_to_consider: ["obsolète"] });
    expect(parsed).not.toHaveProperty("questions_to_consider");
  });

  it("exige entre 1 et 3 key_takeaways", () => {
    expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, key_takeaways: [] }).success).toBe(false);
    expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, key_takeaways: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(activityAnalysisResponseSchema.safeParse({ ...validDebrief, key_takeaways: ["a", "b", "c"] }).success).toBe(true);
  });

  it("rejette un débrief incomplet", () => {
    expect(activityAnalysisResponseSchema.safeParse({ summary: "incomplet" }).success).toBe(false);
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
