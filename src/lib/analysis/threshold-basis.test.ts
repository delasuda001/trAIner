import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, syncedActivities, activityStreamSummaries } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { STREAM_SUMMARY_VERSION } from "./stream-summary";
import { ESTIMATE_WINDOW_WEEKS, aggregateCachedEfforts, toThresholdInput } from "./threshold-basis";
import { estimateThreshold } from "./thresholds";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const NOW = new Date("2026-09-01T00:00:00.000Z");
const weeksBefore = (n: number) => new Date(NOW.getTime() - n * 7 * 24 * 60 * 60 * 1000).toISOString();

function insertRun(id: string, startDate: string, maxHr = 188) {
  return database.insert(syncedActivities).values({ id: `row-${id}`, intervalsActivityId: id, startDate, sportType: "Run", distanceM: 10000, maxHeartRateBpm: maxHr, syncedAt: startDate, createdAt: startDate, updatedAt: startDate });
}

function insertSummary(id: string, efforts: Array<{ durationS: number; speedMps: number; hr: number | null }>, version = STREAM_SUMMARY_VERSION) {
  return database.insert(activityStreamSummaries).values({
    id: `sum-${id}`,
    intervalsActivityId: id,
    streamVersion: version,
    summaryJson: JSON.stringify({
      version,
      computedAt: NOW.toISOString(),
      sampleCount: 1800,
      bestEfforts: efforts.map((e) => ({ durationS: e.durationS, actualElapsedS: e.durationS, distanceM: e.speedMps * e.durationS, speedMps: e.speedMps, meanHeartRateBpm: e.hr })),
    }),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema });
});
afterEach(() => sqlite.close());

describe("aggregateCachedEfforts", () => {
  it("associe la date de l'activité source à chaque meilleur effort retenu", async () => {
    await insertRun("i-recent", weeksBefore(2));
    await insertSummary("i-recent", [{ durationS: 600, speedMps: 4.8, hr: 176 }]);

    const basis = await aggregateCachedEfforts(database, NOW);
    expect(basis.windowWeeks).toBe(ESTIMATE_WINDOW_WEEKS);
    expect(basis.efforts).toHaveLength(1);
    expect(basis.efforts[0]).toMatchObject({ durationS: 600, activityId: "i-recent", activityDateIso: weeksBefore(2) });
  });

  it("exclut de l'estimation active les résumés hors fenêtre, même en cache", async () => {
    await insertRun("i-in", weeksBefore(10));
    await insertRun("i-out", weeksBefore(ESTIMATE_WINDOW_WEEKS + 4));
    await insertSummary("i-in", [{ durationS: 600, speedMps: 4.0, hr: 170 }]);
    await insertSummary("i-out", [{ durationS: 600, speedMps: 9.9, hr: 180 }, { durationS: 1800, speedMps: 9.0, hr: 175 }]);

    const basis = await aggregateCachedEfforts(database, NOW);
    // Le résumé hors fenêtre (plus rapide) est ignoré.
    expect(basis.efforts.map((e) => e.activityId)).toEqual(["i-in"]);
    expect(basis.activitiesWithSummaryInWindow).toBe(1);
    expect(basis.activitiesWithSummaryTotal).toBe(2);
  });

  it("ignore les résumés d'une autre version de format", async () => {
    await insertRun("i1", weeksBefore(3));
    await insertSummary("i1", [{ durationS: 600, speedMps: 5.0, hr: 175 }], "0");
    const basis = await aggregateCachedEfforts(database, NOW);
    expect(basis.efforts).toEqual([]);
  });

  it("déclenche freshnessAlert si aucun point retenu n'a moins de 8 semaines", async () => {
    await insertRun("i-stale-1", weeksBefore(12));
    await insertRun("i-stale-2", weeksBefore(14));
    await insertSummary("i-stale-1", [{ durationS: 300, speedMps: 5.0, hr: 178 }]);
    await insertSummary("i-stale-2", [{ durationS: 1200, speedMps: 4.2, hr: 172 }]);

    const stale = estimateThreshold(toThresholdInput(await aggregateCachedEfforts(database, NOW)));
    expect(stale.validPointCount).toBeGreaterThanOrEqual(2);
    expect(stale.freshnessAlert).toBe(true);
  });

  it("ne déclenche pas freshnessAlert avec un point de moins de 8 semaines", async () => {
    await insertRun("i-old", weeksBefore(12));
    await insertRun("i-fresh", weeksBefore(3));
    await insertSummary("i-old", [{ durationS: 300, speedMps: 5.0, hr: 178 }]);
    await insertSummary("i-fresh", [{ durationS: 1200, speedMps: 4.2, hr: 172 }]);

    const fresh = estimateThreshold(toThresholdInput(await aggregateCachedEfforts(database, NOW)));
    expect(fresh.freshnessAlert).toBe(false);
  });
});
