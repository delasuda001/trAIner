import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, syncedActivities } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { getActivityStreams } from "./route";

vi.mock("server-only", () => ({}));
let sqlite: Database.Database; let database: AppDatabase;
function migration(connection: Database.Database): void { connection.exec(readFileSync(resolve(process.cwd(), "drizzle/0000_previous_marrow.sql"), "utf8").replaceAll("--> statement-breakpoint", "")); }
beforeEach(() => { sqlite = new Database(":memory:"); migration(sqlite); database = drizzle(sqlite, { schema }); process.env.INTERVALS_API_KEY = "test-key"; });
afterEach(() => { vi.unstubAllGlobals(); sqlite.close(); });
const local = { id: "local", intervalsActivityId: "i1", startDate: "2026-08-25T00:00:00.000Z", sportType: "Run", syncedAt: "2026-08-25T00:00:00.000Z", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" };

describe("GET streams", () => {
  it("normalise les séries et exclut latlng", async () => { await database.insert(syncedActivities).values(local); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ type: "time", data: [0, 1] }, { type: "distance", data: [0, 3] }, { type: "velocity_smooth", data: [2, null] }, { type: "latlng", data: [[1, 2], [3, 4]] }]), { status: 200 }))); const response = await getActivityStreams("i1", database); expect(response.status).toBe(200); const payload = await response.json(); expect(payload).toMatchObject({ activityId: "i1", sampleCount: 2, availability: { speed: true } }); expect(JSON.stringify(payload)).not.toMatch(/latlng|latitude|longitude/i); });
  it("retourne 404 sans appeler l’externe pour une activité inconnue", async () => { const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const response = await getActivityStreams("missing", database); expect(response.status).toBe(404); expect(fetchMock).not.toHaveBeenCalled(); });
});