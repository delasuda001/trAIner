import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "@/lib/db/client";
import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";
import { schema } from "@/lib/db/schema";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import type { ActivitySummary, DataSource } from "@/lib/source/types";
import { PROFILE_KEY, athleteProfileSchema, runSync } from "./sync";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema }) as unknown as AppDatabase;
});
afterEach(() => sqlite.close());

function summary(id: string, start: string, sport: ActivitySummary["sport"] = "running"): ActivitySummary {
  return { sourceId: id, name: id, sport, sourceType: sport, startTimeUtc: start, startTimeLocal: start.slice(0, 19), distanceM: 10000, movingTimeS: 3000, elapsedTimeS: 3100, elevationGainM: 20, averageSpeedMps: 3.3, averageHeartRateBpm: 150, maxHeartRateBpm: 170, averageCadenceSpm: 168, trainingLoad: 100, aerobicTrainingEffect: 3, anaerobicTrainingEffect: 0, trainingEffectLabel: "AEROBIC_BASE", hrTimeInZonesS: [0, 1000, 1000, 1000, 0], averageTemperatureC: 15, lapCount: 1 };
}

function fakeSource(activities: ActivitySummary[]) {
  const listCalls: Array<Date | null> = [];
  const detailCalls: string[] = [];
  const source: DataSource = {
    name: "garmin",
    async listActivities(since) {
      listCalls.push(since);
      return activities.filter((activity) => !since || Date.parse(activity.startTimeUtc) >= since.getTime());
    },
    async getActivityDetail(sourceId) {
      detailCalls.push(sourceId);
      if (sourceId === "broken") throw new Error("boom");
      return { streams: null, laps: [] };
    },
    async getWellness(start, end) {
      return [{ date: end, hrvLastNightMs: 60, hrvWeeklyAvgMs: 55, hrvBaselineLowMs: 50, hrvBaselineHighMs: 70, hrvStatus: "BALANCED", sleepDurationS: 28000, sleepScore: 80, restingHeartRateBpm: 46, vo2max: 58 }].filter((day) => day.date >= start);
    },
    async getAthleteProfile() {
      return { heartRateZones: { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" }, lactateThresholdSpeedMps: 3.83 };
    },
  };
  return { source, listCalls, detailCalls };
}

function deps(source: DataSource) {
  return { source, activities: createActivityRepository(database), wellness: createWellnessRepository(database), state: createAppStateRepository(database), now: () => new Date("2026-11-15T12:00:00Z") };
}

describe("runSync", () => {
  it("rapatrie tout l'historique au premier passage, détails des courses seulement, dans la limite du budget", async () => {
    const fake = fakeSource([summary("1", "2026-11-10T10:00:00Z"), summary("2", "2026-11-12T10:00:00Z"), summary("3", "2026-11-13T10:00:00Z", "swimming"), summary("broken", "2026-11-14T10:00:00Z")]);
    const result = await runSync(deps(fake.source), { detailBudget: 2 });
    expect(fake.listCalls).toEqual([null]);
    expect(result.newActivityIds).toHaveLength(4);
    expect(result.detailsFetched + result.detailsFailed).toBe(2);
    expect(fake.detailCalls).not.toContain("3");
    expect(result.pendingDetails).toBe(1);
    expect(createAppStateRepository(database).get(PROFILE_KEY, athleteProfileSchema)?.heartRateZones?.lactateThresholdHeartRateBpm).toBe(169);
  });

  it("est incrémentale : repart de la dernière activité moins 3 jours, sans doublon", async () => {
    const activities = [summary("1", "2026-10-01T10:00:00Z"), summary("2", "2026-11-12T10:00:00Z")];
    const fake = fakeSource(activities);
    await runSync(deps(fake.source), { detailBudget: 10 });
    activities.push(summary("4", "2026-11-15T08:00:00Z"));
    const second = await runSync(deps(fake.source), { detailBudget: 10 });
    expect(fake.listCalls[1]?.toISOString()).toBe("2026-11-09T10:00:00.000Z");
    expect(second.newActivityIds).toEqual(["garmin:4"]);
    expect(second.totalActivities).toBe(3);
  });

  it("profil invité : historique borné, séries récentes seulement, les anciennes restent en attente sans relancer la synchro", async () => {
    const fake = fakeSource([summary("old", "2025-06-01T10:00:00Z"), summary("mid", "2026-07-01T10:00:00Z"), summary("recent", "2026-11-10T10:00:00Z")]);
    const result = await runSync(deps(fake.source), { detailBudget: 10, historyStart: new Date("2025-11-15T12:00:00Z"), detailSince: new Date("2026-08-23T12:00:00Z"), wellnessBackfillDays: 120 });
    expect(fake.listCalls[0]?.toISOString()).toBe("2025-11-15T12:00:00.000Z");
    expect(result.newActivityIds).toEqual(["garmin:mid", "garmin:recent"]);
    expect(fake.detailCalls).toEqual(["recent"]);
    expect(result.pendingDetails).toBe(0);
    expect(createActivityRepository(database).findById("garmin:mid")?.detailStatus).toBe("pending");
  });

  it("enregistre l'erreur sans perdre l'état précédent", async () => {
    const fake = fakeSource([]);
    fake.source.listActivities = async () => { throw new Error("Garmin indisponible"); };
    await expect(runSync(deps(fake.source), { detailBudget: 1 })).rejects.toThrow("Garmin indisponible");
  });
});
