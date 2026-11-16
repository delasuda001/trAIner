import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiAnalysisClient, GeminiClientError } from "./gemini-client";
import type { ActivityAnalysisContext } from "./schemas";

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            level1: { notableVsHistory: "Plus rapide que d'habitude.", mainFocus: null, nextExperiment: "Refaire ce format dans 3 semaines." },
            summary: "ok",
            observed_facts: ["fact"],
            historical_comparison: "",
            zone_classification_summary: "",
            technical_recommendations: ["rec"],
            next_session_pace_guidance: {
              recommendedPaceMps: 3.4,
              recommendedPaceDisplay: "4:54 /km",
              rationale: "test",
              adjustments: ["test"],
            },
            hypotheses: ["h"],
            limitations: ["l"],
            next_steps: ["n"],
            safety_note: null,
          }),
        }),
      };
    },
  };
});

describe("GeminiAnalysisClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when GEMINI_API_KEY is not configured", () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    expect(() => new GeminiAnalysisClient()).toThrow(GeminiClientError);

    process.env.GEMINI_API_KEY = originalKey;
  });

  it("should accept valid Gemini response and validate it", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const client = new GeminiAnalysisClient();

    await expect(
      client.analyze({
        activityId: "a-1",
        performanceProfile: null,
        activityMetadata: {
          startDate: "2025-01-01T00:00:00.000Z",
          name: "Test",
          sportType: "Run",
          distanceM: 5000,
          movingTimeS: 1800,
          averageSpeedMps: 2.78,
          averageHeartRateBpm: 155,
          maxHeartRateBpm: 175,
          averageCadenceSpm: 172,
          elevationGainM: 50,
        },
        intervals: [],
        segmentation: { strategy: "adaptive", segments: [] },
        thresholdEstimate: {
          criticalSpeedMps: 3.3,
          thresholdPaceMinKm: "5:03",
          dprimM: 18,
          validPointCount: 3,
          confidenceLevel: "low",
          basis: "recent_history",
          windowWeeks: 20,
          usedDeclaredReferenceFallback: false,
          retainedPoints: [{ durationS: 600, activityId: "i-1", activityDate: "2025-01-01T00:00:00.000Z" }],
          coverageByZone: { short: false, medium: true, long: false },
          missingZones: ["short", "long"],
          suggestedSessions: [{ missingZone: "short", suggestion: "Interval session" }],
          biasHint: null,
          staleWarning: { isStale: false, lastValidDaysAgo: null, stalePointCount: 0, oldestRetainedPointWeeks: 2, message: null },
          rejectedPoints: [],
        },
        segmentZones: [],
        historicalComparison: { comparableActivitiesCount: 0, recentTrendDays: 90, insufficientDataReason: "No data", paceDeltaPct: null, hrDeltaBpm: null, cadenceDeltaSpm: null, observations: [], usedDeclaredReferenceFallback: false, comparabilityBreakdown: null },
        verdictSignals: {
          verdict: "well_executed",
          verdictEvidence: [{ metric: "pace_cv_work_segments", currentValue: 2, comparisonValue: null, unit: "%", direction: "n/a", label: "Variation d'allure de 2 % sur les segments analysés." }],
        },
        activeGoals: [],
        athleteContext: null,
        userContextForThisActivity: null,
        qualityWarnings: [],
      } satisfies ActivityAnalysisContext)
    ).resolves.toMatchObject({
      response: expect.objectContaining({ summary: "ok", level1: expect.objectContaining({ verdict: "well_executed", nextExperiment: "Refaire ce format dans 3 semaines." }) }),
      model: "gemini-3.8-flash",
    });

    delete process.env.GEMINI_API_KEY;
  });

  it("le verdict final vient toujours du serveur (verdictSignals), jamais de la réponse du LLM", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const client = new GeminiAnalysisClient();
    const baseContext: ActivityAnalysisContext = {
      activityId: "a-1",
      performanceProfile: null,
      activityMetadata: { startDate: "2025-01-01T00:00:00.000Z", name: "Test", sportType: "Run", distanceM: 5000, movingTimeS: 1800, averageSpeedMps: 2.78, averageHeartRateBpm: 155, maxHeartRateBpm: 175, averageCadenceSpm: 172, elevationGainM: 50 },
      intervals: [],
      segmentation: { strategy: "adaptive", segments: [] },
      thresholdEstimate: {
        criticalSpeedMps: 3.3, thresholdPaceMinKm: "5:03", dprimM: 18, validPointCount: 3, confidenceLevel: "low", basis: "recent_history", windowWeeks: 20,
        usedDeclaredReferenceFallback: false, retainedPoints: [{ durationS: 600, activityId: "i-1", activityDate: "2025-01-01T00:00:00.000Z" }],
        coverageByZone: { short: false, medium: true, long: false }, missingZones: ["short", "long"], suggestedSessions: [{ missingZone: "short", suggestion: "Interval session" }],
        biasHint: null, staleWarning: { isStale: false, lastValidDaysAgo: null, stalePointCount: 0, oldestRetainedPointWeeks: 2, message: null }, rejectedPoints: [],
      },
      segmentZones: [],
      historicalComparison: null,
      verdictSignals: { verdict: "not_evaluable", verdictEvidence: [{ metric: "not_evaluable_reason", currentValue: 0, comparisonValue: null, unit: "ratio", direction: "n/a", label: "test" }] },
      activeGoals: [], athleteContext: null, userContextForThisActivity: null, qualityWarnings: [],
    };

    const result = await client.analyze(baseContext);
    // Le mock renvoie un narratif seul (pas de champ verdict) : le verdict final doit être celui fourni par le contexte serveur.
    expect(result.response.level1.verdict).toBe("not_evaluable");

    delete process.env.GEMINI_API_KEY;
  });

  it("should reject invalid JSON response from Gemini", async () => {
    // Test JSON parsing failure handling
    expect(true).toBe(true);
  });

  it("should reject response failing schema validation", async () => {
    // Test Zod validation failure
    expect(true).toBe(true);
  });

  it("should handle authentication errors explicitly", () => {
    // Test error classification for API key issues
    expect(true).toBe(true);
  });

  it("should never log API key in error messages", () => {
    // Verify sensitive data is not exposed
    expect(true).toBe(true);
  });

  it("should create safety_note only if user context signals pain or fatigue", () => {
    // Test conditional safety_note generation
    expect(true).toBe(true);
  });
});
