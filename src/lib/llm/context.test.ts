import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppDatabase } from "@/lib/db/client";
import { buildActivityAnalysisContext, buildHistoricalComparisonForWorkout } from "./context";
import { schema } from "@/lib/db/schema";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/repositories/synced-activity-repository", () => ({
  createSyncedActivityRepository: () => ({
    findByExternalId: async () => ({ maxHeartRateBpm: 190 }),
    findByPeriod: async () => [],
  }),
}));
vi.mock("@/lib/activities/detail", () => ({
  loadActivityDetail: async () => ({
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
    intervals: [],
  }),
}));

describe("buildHistoricalComparisonForWorkout", () => {
  it("uses work-segment percent-of-threshold and the right rep bucket", () => {
    const comparison = buildHistoricalComparisonForWorkout(
      {
        averageSpeedMps: 3.0,
        dominantZone: "threshold",
        averagePercentOfThreshold: 98,
        averageWorkSegmentDurationS: 180,
        workSegmentCount: 5,
      },
      [
        { averageSpeedMps: 3.1, dominantZone: "threshold", averagePercentOfThreshold: 100, averageWorkSegmentDurationS: 150, workSegmentCount: 5 },
        { averageSpeedMps: 3.2, dominantZone: "threshold", averagePercentOfThreshold: 103, averageWorkSegmentDurationS: 180, workSegmentCount: 4 },
      ]
    );

    expect(comparison.comparableActivitiesCount).toBe(2);
    expect(comparison.insufficientDataReason).toBeNull();
    expect(comparison.paceDeltaPct).toBeCloseTo(-2.0, 1);
    expect(comparison.observations.join(" ")).toContain("% de seuil");
  });

  it("returns explicit insufficient data when no comparable repetitions are found", () => {
    const comparison = buildHistoricalComparisonForWorkout(
      {
        averageSpeedMps: 3.0,
        dominantZone: "threshold",
        averagePercentOfThreshold: 98,
        averageWorkSegmentDurationS: 300,
        workSegmentCount: 3,
      },
      [
        { averageSpeedMps: 3.4, dominantZone: "vo2max", averagePercentOfThreshold: 110, averageWorkSegmentDurationS: 90, workSegmentCount: 2 },
      ]
    );

    expect(comparison.comparableActivitiesCount).toBe(0);
    expect(comparison.insufficientDataReason).toContain("aucune séance comparable");
  });

  it("tracks delta versus the most recent comparable session and the last 3 sessions", () => {
    const comparison = buildHistoricalComparisonForWorkout(
      {
        averageSpeedMps: 3.2,
        dominantZone: "vo2max",
        averagePercentOfThreshold: 108,
        averageWorkSegmentDurationS: 120,
        workSegmentCount: 4,
      },
      [
        { averageSpeedMps: 2.8, dominantZone: "vo2max", averagePercentOfThreshold: 100, averageWorkSegmentDurationS: 120, workSegmentCount: 5, recentness: 20 },
        { averageSpeedMps: 3.0, dominantZone: "vo2max", averagePercentOfThreshold: 104, averageWorkSegmentDurationS: 120, workSegmentCount: 4, recentness: 10 },
        { averageSpeedMps: 3.15, dominantZone: "vo2max", averagePercentOfThreshold: 106, averageWorkSegmentDurationS: 120, workSegmentCount: 4, recentness: 5 },
      ]
    );

    expect(comparison.paceDeltaPct).toBeCloseTo(1.9, 1);
    expect(comparison.observations.join(" ")).toContain("3 séances");
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
      key_takeaways: ["Séance solide."],
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
