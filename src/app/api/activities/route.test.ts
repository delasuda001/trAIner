import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, manualSessions, syncedActivities } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { readLocalActivities } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const now = "2026-08-25T12:00:00.000Z";

function applyMigration(connection: Database.Database): void {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_previous_marrow.sql"), "utf8");
  connection.exec(migration.replaceAll("--> statement-breakpoint", ""));
}

beforeEach(() => { sqlite = new Database(":memory:"); applyMigration(sqlite); database = drizzle(sqlite, { schema }); });
afterEach(() => sqlite.close());

describe("GET /api/activities", () => {
  it("lit uniquement synced_activities, filtre la période et respecte la limite", async () => {
    await database.insert(syncedActivities).values([
      { id: "i-1", intervalsActivityId: "i-1", startDate: "2026-08-25T10:00:00.000Z", sportType: "Run", syncedAt: now, createdAt: now, updatedAt: now, distanceM: 5000 },
      { id: "i-2", intervalsActivityId: "i-2", startDate: "2026-08-20T10:00:00.000Z", sportType: "Run", syncedAt: now, createdAt: now, updatedAt: now, distanceM: 7000 },
    ]);
    await database.insert(manualSessions).values({ id: "manual-1", sessionDate: "2026-08-25", discipline: "swimming", durationMinutes: 30, createdAt: now, updatedAt: now });
    const response = await readLocalActivities(new Request("http://localhost/api/activities?from=2026-08-21&to=2026-08-25&limit=1"), database);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([expect.objectContaining({ id: "i-1", distance: 5000 })]);
  });

  it("renvoie une liste vide avant synchronisation", async () => {
    const response = await readLocalActivities(new Request("http://localhost/api/activities"), database);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});