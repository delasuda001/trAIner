import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import * as dbClient from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { createConversationRepository } from "@/lib/db/repositories/conversation-repository";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema });
  vi.spyOn(dbClient, "getDb").mockReturnValue(database);
});

afterEach(() => {
  vi.restoreAllMocks();
  sqlite.close();
});

describe("GET /api/conversations/[id]", () => {
  it("résout les identifiants d’activité cités par les messages assistant persistés", async () => {
    await createSyncedActivityRepository(database).upsert({
      id: "row-1", intervalsActivityId: "i1", startDate: "2026-08-01T07:00:00.000Z", timezone: null, name: "Sortie facile",
      sportType: "Run", distanceM: 8000, movingTimeS: 2400, elapsedTimeS: 2450, elevationGainM: 40,
      averageSpeedMps: 3.3, averageHeartRateBpm: 140, maxHeartRateBpm: 160, averageCadenceSpm: 170, averagePowerW: null,
      trainingLoad: null, sourceUpdatedAt: null, syncedAt: "2026-08-01T08:00:00.000Z", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-01T08:00:00.000Z",
    });
    const repository = createConversationRepository(database);
    const now = "2026-08-02T10:00:00.000Z";
    await repository.createThread({ id: "thread-1", title: "Question", goalId: null, createdAt: now, updatedAt: now });
    await repository.addMessage({ id: "msg-user", threadId: "thread-1", role: "user", contentJson: JSON.stringify("Compare cette activité"), createdAt: now });
    await repository.addMessage({
      id: "msg-assistant", threadId: "thread-1", role: "assistant",
      contentJson: JSON.stringify({ summary: "ok", observedFacts: [], comparisons: [], hypotheses: [], limitations: [], missingData: [], evidence: [{ activityId: "i1", label: "Allure", value: "4:30/km" }] }),
      model: "gemini-test", promptVersion: "1.0", createdAt: now,
    });

    const response = await GET(new Request("http://localhost"), params("thread-1"));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.activityLookup).toEqual({ i1: { date: "2026-08-01T07:00:00.000Z", name: "Sortie facile" } });
    expect(payload.messages).toHaveLength(2);
  });

  it("404 quand la conversation n’existe pas", async () => {
    const response = await GET(new Request("http://localhost"), params("absent"));
    expect(response.status).toBe(404);
  });

  it("ignore silencieusement un message assistant malformé plutôt que de planter", async () => {
    const repository = createConversationRepository(database);
    const now = "2026-08-02T10:00:00.000Z";
    await repository.createThread({ id: "thread-2", title: "Question", goalId: null, createdAt: now, updatedAt: now });
    await repository.addMessage({ id: "msg-bad", threadId: "thread-2", role: "assistant", contentJson: "pas du json", model: null, promptVersion: null, createdAt: now });

    const response = await GET(new Request("http://localhost"), params("thread-2"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.activityLookup).toEqual({});
  });
});
