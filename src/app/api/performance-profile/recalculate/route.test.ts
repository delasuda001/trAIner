import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, syncedActivities, activityStreamSummaries } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { STREAM_SUMMARY_VERSION } from "@/lib/analysis/stream-summary";
import { handleRecalculate } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const nowIso = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function streamsResponse() {
  const time: number[] = [];
  const distance: number[] = [];
  for (let t = 0; t <= 700; t += 1) {
    time.push(t);
    distance.push(t * 3.5);
  }
  return new Response(JSON.stringify([{ type: "time", data: time }, { type: "distance", data: distance }, { type: "heartrate", data: time.map(() => 165) }]), { status: 200 });
}

function run(id: string, startDate: string) {
  return { id: `row-${id}`, intervalsActivityId: id, startDate, sportType: "Run", distanceM: 8000, maxHeartRateBpm: 185, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso };
}

function request(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema });
  process.env.INTERVALS_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  sqlite.close();
});

describe("POST /api/performance-profile/recalculate", () => {
  it("refuse une fenêtre hors bornes", async () => {
    const response = await handleRecalculate(request({ weeks: 60 }), database);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_WEEKS" } });
  });

  it("ne traite que les activités de la fenêtre et saute celles déjà résumées", async () => {
    await database.insert(syncedActivities).values([
      run("i-in-1", daysAgo(3)),
      run("i-in-2", daysAgo(10)),
      run("i-cached", daysAgo(5)),
      run("i-out", daysAgo(90)),
    ]);
    await database.insert(activityStreamSummaries).values({ id: "cached", intervalsActivityId: "i-cached", streamVersion: STREAM_SUMMARY_VERSION, summaryJson: JSON.stringify({ version: STREAM_SUMMARY_VERSION, computedAt: nowIso, sampleCount: 0, bestEfforts: [] }), createdAt: nowIso, updatedAt: nowIso });

    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(streamsResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleRecalculate(request({ weeks: 4 }), database);
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(result.consideredActivities).toBe(3); // i-out (90 j) exclu
    expect(result.computedSummaries).toBe(2); // i-in-1, i-in-2
    expect(result.alreadyFresh).toBe(1); // i-cached
    expect(result.rateLimited).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fetchedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetchedUrls.some((url) => url.includes("i-out"))).toBe(false);
    expect(sqlite.prepare("select count(*) as c from activity_stream_summaries").get()).toMatchObject({ c: 3 });
  });

  it("s'arrête sur un 429 et remonte Retry-After sans relance agressive", async () => {
    await database.insert(syncedActivities).values([run("i-1", daysAgo(2)), run("i-2", daysAgo(3)), run("i-3", daysAgo(4))]);

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(streamsResponse()))
      .mockImplementationOnce(() => Promise.resolve(new Response("rate limited", { status: 429, headers: { "retry-after": "42" } })))
      .mockImplementation(() => Promise.resolve(streamsResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleRecalculate(request({ weeks: 12 }), database);
    expect(response.status).toBe(200);
    expect(response.headers.get("Retry-After")).toBe("42");
    const result = await response.json();
    expect(result.rateLimited).toBe(true);
    expect(result.retryAfter).toBe("42");
    expect(result.computedSummaries).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // arrêt immédiat après le 429
  });
});
