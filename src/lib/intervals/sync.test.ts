import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { calculateSyncPeriod, synchronizeRunningActivities } from "./sync";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const now = "2026-08-25T12:00:00.000Z";
const run = { id: "i-run-1", type: "Run", start_date: "2026-08-22T15:27:15Z", timezone: null, name: "Sortie", distance: 5000, moving_time: 1500, elapsed_time: 1520, average_speed: 3.33, average_heartrate: 145, max_heartrate: 160, average_cadence: 80, icu_average_watts: null, total_elevation_gain: 20, icu_training_load: 32, icu_sync_date: "2026-08-24T20:44:08.576+00:00" };

function applyMigration(connection: Database.Database): void {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_previous_marrow.sql"), "utf8");
  connection.exec(migration.replaceAll("--> statement-breakpoint", ""));
}

beforeEach(() => { sqlite = new Database(":memory:"); applyMigration(sqlite); database = drizzle(sqlite, { schema }); process.env.INTERVALS_API_KEY = "test-key"; process.env.INTERVALS_ATHLETE_ID = "test-athlete"; });
afterEach(() => { vi.unstubAllGlobals(); sqlite.close(); });

describe("synchronisation des activités de course", () => {
  it("crée les courses, ignore les autres sports et compte les activités invalides", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([run, { ...run, id: "i-swim-1", type: "Swim" }, { id: "invalid", type: "Run", start_date: "not-a-date" }]), { status: 200 })));
    const result = await synchronizeRunningActivities({ weeks: 12, requestId: "sync-test-1", database });
    expect(result).toMatchObject({ receivedCount: 3, createdCount: 1, ignoredUnsupportedSportCount: 1, invalidActivityCount: 1, failedCount: 0 });
    expect(sqlite.prepare("select count(*) as count from synced_activities").get()).toMatchObject({ count: 1 });
  });

  it("est idempotente puis met à jour une activité modifiée", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...run, distance: 5200 }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(synchronizeRunningActivities({ weeks: 12, database })).resolves.toMatchObject({ createdCount: 1 });
    await expect(synchronizeRunningActivities({ weeks: 12, database })).resolves.toMatchObject({ unchangedCount: 1, createdCount: 0, updatedCount: 0 });
    await expect(synchronizeRunningActivities({ weeks: 12, database })).resolves.toMatchObject({ updatedCount: 1 });
    expect(sqlite.prepare("select count(*) as count, distance_m as distance from synced_activities").get()).toMatchObject({ count: 1, distance: 5200 });
  });

  it("contrôle la période par défaut et les bornes", () => {
    expect(calculateSyncPeriod(12, new Date(now))).toEqual({ weeks: 12, oldest: "2026-06-02", newest: "2026-08-25" });
    expect(calculateSyncPeriod(1, new Date(now)).weeks).toBe(1);
    expect(calculateSyncPeriod(52, new Date(now)).weeks).toBe(52);
  });

  it("refuse une réponse globale invalide, une panne réseau et un 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ activities: [] }), { status: 200 })));
    await expect(synchronizeRunningActivities({ weeks: 12, database })).rejects.toMatchObject({ name: "IntervalsValidationError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(synchronizeRunningActivities({ weeks: 12, database })).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("limited", { status: 429, headers: { "Retry-After": "30" } })));
    await expect(synchronizeRunningActivities({ weeks: 12, database })).rejects.toMatchObject({ status: 429, retryAfter: "30" });
  });
});