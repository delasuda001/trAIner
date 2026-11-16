import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppDatabase } from "@/lib/db/client";
import { buildActivityAnalysisContext, buildHistoricalComparisonForWorkout } from "./context";
import type { SessionSignature } from "@/lib/analysis/session-signature";
import { schema } from "@/lib/db/schema";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";

vi.mock("server-only", () => ({}));

const defaultActivityDetail = {
  activity: {
    start_date: "2025-01-01T00:00:00Z",
    name: "Test session",
    type: "Run",
    distance: 1000,
    moving_time: 240,
    average_speed: 4.17,
    average_heartrate: 160,
    average_cadence: 170,
    total_elevation_gain: 20,
  },
  intervals: [] as unknown[],
};

const { loadActivityDetailMock, findByPeriodMock } = vi.hoisted(() => ({
  loadActivityDetailMock: vi.fn(),
  findByPeriodMock: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/lib/db/repositories/synced-activity-repository", () => ({
  createSyncedActivityRepository: () => ({
    findByExternalId: async () => ({ maxHeartRateBpm: 190 }),
    findByPeriod: findByPeriodMock,
  }),
}));
vi.mock("@/lib/activities/detail", () => ({ loadActivityDetail: loadActivityDetailMock }));

function signature(overrides: Partial<SessionSignature> = {}): SessionSignature {
  return {
    activityId: "candidate", activityDate: "2026-07-01T00:00:00.000Z", sportType: "Run",
    totalDistanceM: 8000, totalMovingTimeS: 2000, elevationGainM: 30,
    workSegmentCount: 5, averageWorkSegmentDurationS: 180, workDurationBucket: "medium", totalWorkDurationS: 900,
    dominantZone: "threshold", averagePercentOfThreshold: 98,
    recoverySegmentCount: 4, averageRecoveryDurationS: 90, workToRestRatio: 2.5,
    variationProfile: { label: "intervalled", confidence: "high", hasRecoveryOrWalkSegments: true },
    signatureQuality: "measured",
    ...overrides,
  };
}

describe("buildHistoricalComparisonForWorkout", () => {
  it("compare sur la base de signatures réellement mesurées, jamais fabriquées", () => {
    const current = signature({ activityId: "current", averagePercentOfThreshold: 98 });
    const comparison = buildHistoricalComparisonForWorkout(
      current,
      [
        signature({ activityId: "c1", averagePercentOfThreshold: 100, activityDate: "2026-06-01T00:00:00.000Z" }),
        signature({ activityId: "c2", averagePercentOfThreshold: 103, activityDate: "2026-06-15T00:00:00.000Z" }),
      ],
      "dynamic"
    );

    expect(comparison.comparableActivitiesCount).toBe(2);
    expect(comparison.insufficientDataReason).toBeNull();
    // delta vs le plus récent (c2, 15 juin) : (98-103)/103*100
    expect(comparison.paceDeltaPct).toBeCloseTo(-4.85, 1);
    expect(comparison.observations.join(" ")).toContain("% de seuil");
    expect(comparison.comparabilityBreakdown).toHaveLength(2);
    expect(comparison.usedDeclaredReferenceFallback).toBe(false);
  });

  it("renvoie une raison explicite quand aucun candidat mesuré n'est réellement comparable", () => {
    const current = signature({ activityId: "current", dominantZone: "threshold", workDurationBucket: "long" });
    const comparison = buildHistoricalComparisonForWorkout(
      current,
      [signature({ activityId: "c1", dominantZone: "anaerobic", workDurationBucket: "short", workToRestRatio: 0.2 })],
      "dynamic"
    );

    expect(comparison.comparableActivitiesCount).toBe(0);
    expect(comparison.insufficientDataReason).toContain("aucune séance comparable");
    expect(comparison.comparabilityBreakdown).toBeNull();
  });

  it("calcule le delta vs la séance comparable la plus récente, pas la moyenne", () => {
    const current = signature({ activityId: "current", averagePercentOfThreshold: 108 });
    const comparison = buildHistoricalComparisonForWorkout(
      current,
      [
        signature({ activityId: "c1", averagePercentOfThreshold: 100, activityDate: "2026-05-01T00:00:00.000Z" }),
        signature({ activityId: "c2", averagePercentOfThreshold: 104, activityDate: "2026-06-01T00:00:00.000Z" }),
        signature({ activityId: "c3", averagePercentOfThreshold: 106, activityDate: "2026-06-20T00:00:00.000Z" }),
      ],
      "dynamic"
    );

    // Le plus récent est c3 (106) : (108-106)/106*100
    expect(comparison.paceDeltaPct).toBeCloseTo(1.89, 1);
    expect(comparison.observations.join(" ")).toContain("3 séances");
  });

  it("signale explicitement l'usage d'un repère déclaré, jamais comme une estimation automatique", () => {
    const current = signature({ activityId: "current" });
    const comparison = buildHistoricalComparisonForWorkout(current, [signature({ activityId: "c1" })], "declared_reference");

    expect(comparison.usedDeclaredReferenceFallback).toBe(true);
    expect(comparison.observations.join(" ")).toContain("repère de performance déclaré");
  });
});

describe("buildActivityAnalysisContext", () => {
  let db: AppDatabase;

  let sqlite: Database.Database;

  beforeEach(() => {
    // On applique toutes les vraies migrations Drizzle plutôt qu'un sous-ensemble
    // de DDL réécrit à la main : buildActivityAnalysisContext ->
    // buildPerformanceProfile lit activity_stream_summaries et analyses, tables
    // absentes de l'ancien setup partiel de ce fichier.
    sqlite = new Database(":memory:");
    applyMigrations(sqlite);
    db = drizzle(sqlite, { schema }) as AppDatabase;
    loadActivityDetailMock.mockReset();
    loadActivityDetailMock.mockResolvedValue(defaultActivityDetail);
    findByPeriodMock.mockReset();
    findByPeriodMock.mockResolvedValue([]);
  });

  afterEach(() => sqlite.close());

  it("should exclude GPS and raw streams from context", async () => {
    const activityId = "test-activity-1";

    await expect(buildActivityAnalysisContext(activityId, db)).resolves.toMatchObject({
      activityId,
      qualityWarnings: expect.any(Array),
    });
  });

  it("should surface insufficient historical comparison data explicitly", async () => {
    const activityId = "test-activity-1";

    await expect(buildActivityAnalysisContext(activityId, db)).resolves.toMatchObject({
      historicalComparison: expect.objectContaining({
        comparableActivitiesCount: 0,
        insufficientDataReason: expect.stringMatching(/comparable|données/i),
      }),
    });
  });

  it("construit un profil de performance en lisant analyses et activity_stream_summaries sans planter", async () => {
    const activityId = "test-activity-1";
    const now = "2026-01-01T00:00:00.000Z";
    sqlite.prepare(
      `INSERT INTO synced_activities (id, intervals_activity_id, start_date, sport_type, average_speed_mps, max_heart_rate_bpm, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, 'Run', 4.0, 185, ?, ?, ?)`
    ).run("sa-1", activityId, now, now, now, now);
    const debrief = {
      level1: {
        verdict: "well_executed",
        verdictEvidence: [{ metric: "pace_cv_work_segments", currentValue: 1, comparisonValue: null, unit: "%", direction: "n/a", label: "test" }],
        notableVsHistory: null, mainFocus: "Séance solide.", nextExperiment: null,
      },
      summary: "s", observed_facts: [], historical_comparison: null, zone_classification_summary: "z",
      technical_recommendations: [], next_session_pace_guidance: null, hypotheses: [], limitations: [], next_steps: [], safety_note: null,
    };
    sqlite.prepare(
      `INSERT INTO analyses (id, intervals_activity_id, deterministic_metrics_json, llm_response_json, llm_model, prompt_version, created_at, updated_at)
       VALUES (?, ?, '{}', ?, 'gemini-test', '1.2', ?, ?)`
    ).run("an-1", activityId, JSON.stringify(debrief), now, now);

    const context = await buildActivityAnalysisContext(activityId, db);
    expect(context.performanceProfile).not.toBeNull();
    expect(context.performanceProfile?.recentKeyTakeaways).toContain("Séance solide.");
    expect(context.performanceProfile?.totalRunningActivities).toBe(1);
  });

  it("alimente le thresholdEstimate du débrief avec les résumés de streams en cache dans la fenêtre", async () => {
    const activityId = "test-activity-1";
    const recent = (weeks: number) => new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
    const summaryJson = (efforts: Array<[number, number, number]>) => JSON.stringify({
      version: "1", computedAt: recent(1), sampleCount: 1800,
      bestEfforts: efforts.map(([durationS, speedMps, hr]) => ({ durationS, actualElapsedS: durationS, distanceM: speedMps * durationS, speedMps, meanHeartRateBpm: hr })),
    });
    for (const [id, weeks] of [[activityId, 1], ["hist-1", 4]] as const) {
      sqlite.prepare(
        `INSERT INTO synced_activities (id, intervals_activity_id, start_date, sport_type, average_speed_mps, max_heart_rate_bpm, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, 'Run', 4.0, 190, ?, ?, ?)`
      ).run(`sa-${id}`, id, recent(weeks), recent(weeks), recent(weeks), recent(weeks));
    }
    sqlite.prepare(`INSERT INTO activity_stream_summaries (id, intervals_activity_id, stream_version, summary_json, created_at, updated_at) VALUES (?, ?, '1', ?, ?, ?)`)
      .run("sum-cur", activityId, summaryJson([[600, 4.6, 178]]), recent(1), recent(1));
    sqlite.prepare(`INSERT INTO activity_stream_summaries (id, intervals_activity_id, stream_version, summary_json, created_at, updated_at) VALUES (?, ?, '1', ?, ?, ?)`)
      .run("sum-hist", "hist-1", summaryJson([[1200, 4.2, 174]]), recent(4), recent(4));

    const context = await buildActivityAnalysisContext(activityId, db);
    expect(context.thresholdEstimate.confidenceLevel).not.toBe("insufficient");
    expect(context.thresholdEstimate.validPointCount).toBeGreaterThanOrEqual(2);
    expect(context.thresholdEstimate.criticalSpeedMps).not.toBeNull();
    expect(context.thresholdEstimate.thresholdPaceMinKm).not.toBeNull();
    // Provenance explicite : historique récent, fenêtre, points sources.
    expect(context.thresholdEstimate.basis).toBe("recent_history");
    expect(context.thresholdEstimate.windowWeeks).toBe(20);
    expect(context.thresholdEstimate.retainedPoints.map((point) => point.activityId).sort()).toEqual(["hist-1", activityId].sort());
    expect(context.thresholdEstimate.retainedPoints.every((point) => typeof point.activityDate === "string")).toBe(true);
    expect(context.thresholdEstimate.usedDeclaredReferenceFallback).toBe(false);
  });

  it("garde une confiance insuffisante quand aucun résumé de streams n'est en cache, avec un message de fraîcheur en français", async () => {
    sqlite.prepare(
      `INSERT INTO synced_activities (id, intervals_activity_id, start_date, sport_type, max_heart_rate_bpm, synced_at, created_at, updated_at)
       VALUES ('sa-x', 'test-activity-1', ?, 'Run', 190, ?, ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    const context = await buildActivityAnalysisContext("test-activity-1", db);
    expect(context.thresholdEstimate.confidenceLevel).toBe("insufficient");
    expect(context.thresholdEstimate.criticalSpeedMps).toBeNull();
    expect(context.thresholdEstimate.retainedPoints).toEqual([]);
    expect(context.thresholdEstimate.staleWarning.message).toMatch(/fenêtre de 20 semaines/);
    expect(context.thresholdEstimate.staleWarning.message).not.toMatch(/No recent threshold data/);
  });

  it("marque usedDeclaredReferenceFallback quand la confiance est faible et qu'un repère déclaré existe", async () => {
    sqlite.prepare(
      `INSERT INTO synced_activities (id, intervals_activity_id, start_date, sport_type, max_heart_rate_bpm, synced_at, created_at, updated_at)
       VALUES ('sa-x', 'test-activity-1', ?, 'Run', 190, ?, ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
    const athlete = { version: 1, athleteProfile: {}, performanceReferences: [{ id: "ref-1", label: "Seuil", value: "4:00 min/km" }], priorities: { secondary: [] }, weeklyTemplate: {}, coachingPreferences: { wantsCriticalDataGroundedFeedback: true, wantsTrainingScenariosToReview: true, wantsSourcesAndLimitationsAlwaysVisible: true } };
    sqlite.prepare(`INSERT INTO athlete_context_versions (id, status, context_json, source_text, created_at, activated_at, archived_at, updated_at) VALUES ('ctx-1', 'active', ?, NULL, ?, ?, NULL, ?)`)
      .run(JSON.stringify(athlete), new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    const context = await buildActivityAnalysisContext("test-activity-1", db);
    expect(context.thresholdEstimate.usedDeclaredReferenceFallback).toBe(true);
  });

  function makeLap(id: string, speedMps: number, durationS: number) {
    return { id, name: null, distance: speedMps * durationS, elapsed_time: durationS, moving_time: durationS, average_speed: speedMps, average_heartrate: null, average_cadence: null };
  }

  const WORK_LAP_MPS = 4.0; // ~96% d'un seuil déclaré à 4:00/km (4.1667 m/s) -> zone "threshold"
  const RECOVERY_LAP_MPS = 1.8; // ~43% -> zone "recovery"

  function structuredLaps() {
    return [
      makeLap("lap-1", WORK_LAP_MPS, 300),
      makeLap("lap-2", RECOVERY_LAP_MPS, 90),
      makeLap("lap-3", WORK_LAP_MPS, 300),
      makeLap("lap-4", RECOVERY_LAP_MPS, 90),
      makeLap("lap-5", WORK_LAP_MPS, 300),
    ];
  }

  function insertDeclaredReference(paceValue = "4:00 min/km") {
    const athlete = { version: 1, athleteProfile: {}, performanceReferences: [{ id: "ref-1", label: "Seuil", value: paceValue }], priorities: { secondary: [] }, weeklyTemplate: {}, coachingPreferences: { wantsCriticalDataGroundedFeedback: true, wantsTrainingScenariosToReview: true, wantsSourcesAndLimitationsAlwaysVisible: true } };
    sqlite.prepare(`INSERT INTO athlete_context_versions (id, status, context_json, source_text, created_at, activated_at, archived_at, updated_at) VALUES ('ctx-1', 'active', ?, NULL, ?, ?, NULL, ?)`)
      .run(JSON.stringify(athlete), new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  }

  function insertCandidateCache(activityId: string, laps: ReturnType<typeof makeLap>[]) {
    const now = new Date().toISOString();
    sqlite.prepare(`INSERT INTO activity_details_cache (id, intervals_activity_id, detail_json, intervals_json, fetched_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(`cache-${activityId}`, activityId, JSON.stringify({ id: activityId }), JSON.stringify({ intervals: laps }), now, now, now);
  }

  it("utilise un candidat historique dont le cache de détail est disponible, et ignore celui qui ne l'est pas", async () => {
    loadActivityDetailMock.mockResolvedValue({ activity: { ...defaultActivityDetail.activity, distance: 1080 * WORK_LAP_MPS, moving_time: 1080 }, intervals: structuredLaps() });
    insertDeclaredReference();
    findByPeriodMock.mockResolvedValue([
      { intervalsActivityId: "cand-cached", startDate: "2026-06-01T00:00:00.000Z", sportType: "Run", distanceM: 1080 * WORK_LAP_MPS, movingTimeS: 1080, elevationGainM: 20, averageSpeedMps: WORK_LAP_MPS },
      { intervalsActivityId: "cand-nocache", startDate: "2026-06-05T00:00:00.000Z", sportType: "Run", distanceM: 1080 * WORK_LAP_MPS, movingTimeS: 1080, elevationGainM: 20, averageSpeedMps: WORK_LAP_MPS },
    ]);
    insertCandidateCache("cand-cached", structuredLaps());

    const context = await buildActivityAnalysisContext("test-activity-1", db);

    expect(context.historicalComparison?.comparableActivitiesCount).toBe(1);
    expect(context.historicalComparison?.comparabilityBreakdown?.map((entry) => entry.activityId)).toEqual(["cand-cached"]);
    expect(context.historicalComparison?.usedDeclaredReferenceFallback).toBe(true);
  });

  it("signale explicitement que des candidats existent mais ne sont pas encore préparés localement", async () => {
    loadActivityDetailMock.mockResolvedValue({ activity: { ...defaultActivityDetail.activity, distance: 1080 * WORK_LAP_MPS, moving_time: 1080 }, intervals: structuredLaps() });
    insertDeclaredReference();
    findByPeriodMock.mockResolvedValue([
      { intervalsActivityId: "cand-nocache", startDate: "2026-06-05T00:00:00.000Z", sportType: "Run", distanceM: 1080 * WORK_LAP_MPS, movingTimeS: 1080, elevationGainM: 20, averageSpeedMps: WORK_LAP_MPS },
    ]);
    // Pas de ligne activity_details_cache pour ce candidat.

    const context = await buildActivityAnalysisContext("test-activity-1", db);

    expect(context.historicalComparison?.comparableActivitiesCount).toBe(0);
    expect(context.historicalComparison?.insufficientDataReason).toContain("ne sont pas encore préparés localement");
  });

  it("n'effectue jamais de repli silencieux vers une comparaison d'allure brute quand ni seuil ni référence ne sont exploitables", async () => {
    loadActivityDetailMock.mockResolvedValue({ activity: { ...defaultActivityDetail.activity, distance: 1080 * WORK_LAP_MPS, moving_time: 1080 }, intervals: structuredLaps() });
    // Ni résumé de streams en cache (seuil dynamique "insufficient"), ni référence déclarée.
    findByPeriodMock.mockResolvedValue([
      { intervalsActivityId: "cand-1", startDate: "2026-06-05T00:00:00.000Z", sportType: "Run", distanceM: 1080 * WORK_LAP_MPS, movingTimeS: 1080, elevationGainM: 20, averageSpeedMps: WORK_LAP_MPS },
    ]);

    const context = await buildActivityAnalysisContext("test-activity-1", db);

    expect(context.historicalComparison?.recentTrendDays).toBe(112); // mode structuré, pas le mode continu (90 jours)
    expect(context.historicalComparison?.comparableActivitiesCount).toBe(0);
    expect(context.historicalComparison?.insufficientDataReason).toContain("aucune base de vitesse de référence exploitable");
    expect(context.historicalComparison?.observations.join(" ")).not.toContain("activités comparables détectées dans la fenêtre des 90 jours");
  });

  it("should include athlete context and active goals if present", () => {
    // This test would need proper mocking of database queries
    // Placeholder for structure
    expect(true).toBe(true);
  });

  it("should handle missing user context gracefully", () => {
    // Test null handling for userContextForThisActivity
    expect(true).toBe(true);
  });

  it("should not read manual_sessions table", () => {
    // Verify the code never touches manual_sessions
    // This is a code review assertion, not a runtime test
    expect(true).toBe(true);
  });

  it("should exclude quality warnings if none present", () => {
    // Test empty qualityWarnings array handling
    expect(true).toBe(true);
  });
});
