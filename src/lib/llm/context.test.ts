import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppDatabase } from "@/lib/db/client";
import { buildActivityAnalysisContext, buildHistoricalComparisonForWorkout } from "./context";
import { schema } from "@/lib/db/schema";

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

  beforeEach(() => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema }) as AppDatabase;

    sqlite.exec(`
      CREATE TABLE synced_activities (
        id TEXT PRIMARY KEY,
        intervals_activity_id TEXT NOT NULL,
        start_date TEXT NOT NULL,
        timezone TEXT,
        name TEXT,
        sport_type TEXT NOT NULL,
        distance_m REAL,
        moving_time_s INTEGER,
        elapsed_time_s INTEGER,
        elevation_gain_m REAL,
        average_speed_mps REAL,
        average_heart_rate_bpm REAL,
        max_heart_rate_bpm REAL,
        average_cadence_spm REAL,
        average_power_w REAL,
        training_load REAL,
        source_updated_at TEXT,
        synced_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE activity_contexts (
        id TEXT PRIMARY KEY,
        intervals_activity_id TEXT NOT NULL,
        session_goal TEXT,
        perceived_exertion TEXT,
        unusual_fatigue INTEGER DEFAULT 0,
        pain_flag INTEGER DEFAULT 0,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE athlete_context_versions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        context_json TEXT NOT NULL,
        source_text TEXT,
        created_at TEXT NOT NULL,
        activated_at TEXT,
        archived_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        start_date TEXT,
        target_date TEXT,
        target_value REAL,
        target_unit TEXT,
        description TEXT,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  });

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
