import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { handlePost } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;

beforeEach(() => { sqlite = new Database(":memory:"); applyMigrations(sqlite); database = drizzle(sqlite, { schema }); process.env.INTERVALS_API_KEY = "test-key"; process.env.INTERVALS_ATHLETE_ID = "test-athlete"; });
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