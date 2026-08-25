import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { handlePost } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;

function applyMigration(connection: Database.Database): void {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_previous_marrow.sql"), "utf8");
  connection.exec(migration.replaceAll("--> statement-breakpoint", ""));
}

beforeEach(() => { sqlite = new Database(":memory:"); applyMigration(sqlite); database = drizzle(sqlite, { schema }); process.env.INTERVALS_API_KEY = "test-key"; process.env.INTERVALS_ATHLETE_ID = "test-athlete"; });
afterEach(() => { vi.unstubAllGlobals(); sqlite.close(); });

describe("POST /api/sync/activities", () => {
  it.each([0, 53, 1.5])("refuse weeks=%s", async (weeks) => {
    const response = await handlePost(new Request("http://localhost", { method: "POST", body: JSON.stringify({ weeks }) }), database);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_WEEKS" } });
  });

  it("utilise 12 semaines par défaut et accepte les bornes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response("[]", { status: 200 }))));
    const defaultResponse = await handlePost(new Request("http://localhost", { method: "POST", body: "{}" }), database);
    expect(defaultResponse.status).toBe(200);
    const requestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(requestUrl).toContain("oldest=");
    await expect(handlePost(new Request("http://localhost", { method: "POST", body: JSON.stringify({ weeks: 1 }) }), database)).resolves.toHaveProperty("status", 200);
    await expect(handlePost(new Request("http://localhost", { method: "POST", body: JSON.stringify({ weeks: 52 }) }), database)).resolves.toHaveProperty("status", 200);
  });
});