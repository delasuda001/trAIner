import Database from "better-sqlite3";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { activityDetailsCache, schema, syncedActivities } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";

vi.mock("server-only", () => ({}));

import { getActivityDetail } from "./route";

const activity = { id: "activity-123", name: "Sortie facile", type: "Run", distance: 5000, moving_time: 1500, average_speed: 3.33 };
const interval = { id: 1, label: "Lap 1", distance: 1000, moving_time: 300, average_speed: 3.33 };
let sqlite: Database.Database;
let database: AppDatabase;

beforeEach(() => { sqlite = new Database(":memory:"); applyMigrations(sqlite); database = drizzle(sqlite, { schema }); });
afterEach(() => { vi.unstubAllGlobals(); sqlite.close(); });
beforeAll(() => { process.env.INTERVALS_API_KEY = "test-key"; process.env.INTERVALS_ATHLETE_ID = "test-athlete"; });

describe("GET /api/activities/[id]", () => {
  it("retourne les métadonnées et les laps", async () => {
    await database.insert(syncedActivities).values({ id: "local-1", intervalsActivityId: "activity-123", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T12:00:00.000Z", createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(activity), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "activity-123", icu_intervals: [interval] }), { status: 200 })));

    const response = await getActivityDetail("activity-123", database);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ activity, intervals: [{ id: 1, name: "Lap 1", distance: 1000, moving_time: 300, average_speed: 3.33 }], dataAvailability: { intervals: true }, sourceMetadata: { cacheStatus: "refreshed" } });
  });

  it("retourne 404 quand l’activité est absente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

    const response = await getActivityDetail("missing", database);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "LOCAL_ACTIVITY_NOT_FOUND" } });
  });

  it("retourne 502 quand la réponse activité est invalide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "Sans identifiant" }), { status: 200 })));

    await database.insert(syncedActivities).values({ id: "local-1", intervalsActivityId: "activity-123", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T12:00:00.000Z", createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    const response = await getActivityDetail("activity-123", database);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERVALS_VALIDATION_ERROR" } });
  });

  it("retourne 502 en cas d’erreur réseau externe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));

    await database.insert(syncedActivities).values({ id: "local-1", intervalsActivityId: "activity-123", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T12:00:00.000Z", createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    const response = await getActivityDetail("activity-123", database);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERVALS_API_ERROR" } });
  });

  it("réutilise un cache détail frais sans appel externe", async () => {
    await database.insert(syncedActivities).values({ id: "local-1", intervalsActivityId: "activity-123", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T12:00:00.000Z", createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    await database.insert(activityDetailsCache).values({ id: "cache-1", intervalsActivityId: "activity-123", detailJson: JSON.stringify(activity), intervalsJson: JSON.stringify({ intervals: [{ id: interval.id, name: "Lap 1", distance: interval.distance, moving_time: interval.moving_time, average_speed: interval.average_speed }] }), sourceUpdatedAt: null, fetchedAt: new Date().toISOString(), createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await getActivityDetail("activity-123", database);
    expect(response.status).toBe(200); expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ sourceMetadata: { cacheStatus: "fresh" }, intervals: [{ id: 1 }] });
  });

  it("rafraîchit un cache expiré", async () => {
    await database.insert(syncedActivities).values({ id: "local-1", intervalsActivityId: "activity-123", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T12:00:00.000Z", createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    await database.insert(activityDetailsCache).values({ id: "cache-1", intervalsActivityId: "activity-123", detailJson: JSON.stringify(activity), intervalsJson: JSON.stringify({ intervals: [] }), sourceUpdatedAt: null, fetchedAt: "2020-01-01T00:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(activity), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "activity-123", icu_intervals: [interval] }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await expect((await getActivityDetail("activity-123", database)).json()).resolves.toMatchObject({ sourceMetadata: { cacheStatus: "refreshed" }}); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("n’expose pas une coordonnée GPS du détail", async () => {
    await database.insert(syncedActivities).values({ id: "local-1", intervalsActivityId: "activity-123", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T12:00:00.000Z", createdAt: "2026-08-25T12:00:00.000Z", updatedAt: "2026-08-25T12:00:00.000Z" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...activity, latitude: 1, longitude: 2, polyline: "secret" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "activity-123", icu_intervals: [] }), { status: 200 })));
    const response = await getActivityDetail("activity-123", database); expect(JSON.stringify(await response.json())).not.toMatch(/latitude|longitude|polyline|secret/i);
  });
});