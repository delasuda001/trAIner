import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, syncedActivities, activityStreamSummaries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/client";
import { getActivityStreams } from "./route";
import { STREAM_SUMMARY_VERSION } from "@/lib/analysis/stream-summary";

vi.mock("server-only", () => ({}));
let sqlite: Database.Database; let database: AppDatabase;
beforeEach(() => { sqlite = new Database(":memory:"); applyMigrations(sqlite); database = drizzle(sqlite, { schema }); process.env.INTERVALS_API_KEY = "test-key"; });
afterEach(() => { vi.unstubAllGlobals(); sqlite.close(); });
const local = { id: "local", intervalsActivityId: "i1", startDate: "2026-08-25T00:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T00:00:00.000Z", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" };

describe("GET streams", () => {
  it("normalise les séries et exclut latlng", async () => { await database.insert(syncedActivities).values(local); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ type: "time", data: [0, 1] }, { type: "distance", data: [0, 3] }, { type: "velocity_smooth", data: [2, null] }, { type: "latlng", data: [[1, 2], [3, 4]] }]), { status: 200 }))); const response = await getActivityStreams("i1", database); expect(response.status).toBe(200); const payload = await response.json(); expect(payload).toMatchObject({ activityId: "i1", sampleCount: 2, availability: { speed: true } }); expect(JSON.stringify(payload)).not.toMatch(/latlng|latitude|longitude/i); });
  it("retourne 404 sans appeler l’externe pour une activité inconnue", async () => { const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const response = await getActivityStreams("missing", database); expect(response.status).toBe(404); expect(fetchMock).not.toHaveBeenCalled(); });

  it("persiste un résumé dérivé agrégé (best efforts + FC), sans aucune donnée brute ni GPS", async () => {
    await database.insert(syncedActivities).values(local);
    const time: number[] = []; const distance: number[] = []; const hr: number[] = [];
    for (let t = 0; t <= 700; t += 1) { time.push(t); distance.push(t * 3.4); hr.push(160); }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ type: "time", data: time }, { type: "distance", data: distance }, { type: "heartrate", data: hr }, { type: "latlng", data: time.map((t) => [t, t]) }]), { status: 200 })));

    const response = await getActivityStreams("i1", database);
    expect(response.status).toBe(200);

    const rows = await database.select().from(activityStreamSummaries).where(eq(activityStreamSummaries.intervalsActivityId, "i1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].streamVersion).toBe(STREAM_SUMMARY_VERSION);
    const summary = JSON.parse(rows[0].summaryJson);
    expect(Object.keys(summary).sort()).toEqual(["bestEfforts", "computedAt", "sampleCount", "version"]);
    expect(summary.bestEfforts.map((e: { durationS: number }) => e.durationS)).toEqual([180, 300, 600]);
    expect(summary.bestEfforts[0].meanHeartRateBpm).toBe(160);
    expect(rows[0].summaryJson).not.toMatch(/latlng|latitude|longitude/i);
  });
});