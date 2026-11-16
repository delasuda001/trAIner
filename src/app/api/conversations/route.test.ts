import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import * as dbClient from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const conversationPayload = {
  summary: "Cette sortie est cohérente avec vos séances récentes.",
  observedFacts: ["Allure moyenne 4:30/km"],
  comparisons: ["Comparable à la sortie du i1"],
  hypotheses: [],
  limitations: [],
  missingData: [],
  evidence: [
    { activityId: "i1", label: "Allure", value: "4:30/km" },
    { activityId: null, label: "Volume 12 semaines", value: "180 km" },
  ],
};

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify(conversationPayload) }) };
  },
}));

let sqlite: Database.Database;
let database: AppDatabase;

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema });
  vi.spyOn(dbClient, "getDb").mockReturnValue(database);
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  sqlite.close();
});

describe("POST /api/conversations", () => {
  it("résout les identifiants d’activité cités en preuve vers une date et un nom lisibles", async () => {
    await createSyncedActivityRepository(database).upsert({
      id: "row-1", intervalsActivityId: "i1", startDate: "2026-08-01T07:00:00.000Z", timezone: null, name: "Sortie facile",
      sportType: "Run", distanceM: 8000, movingTimeS: 2400, elapsedTimeS: 2450, elevationGainM: 40,
      averageSpeedMps: 3.3, averageHeartRateBpm: 140, maxHeartRateBpm: 160, averageCadenceSpm: 170, averagePowerW: null,
      trainingLoad: null, sourceUpdatedAt: null, syncedAt: "2026-08-01T08:00:00.000Z", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-01T08:00:00.000Z",
    });

    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ question: "Compare cette activité à mes séances similaires." }) }));
    expect(response.status).toBe(201);
    const payload = await response.json();

    expect(payload.activityLookup).toEqual({ i1: { date: "2026-08-01T07:00:00.000Z", name: "Sortie facile" } });
    expect(payload.response.evidence).toHaveLength(2);
  });

  it("ne fabrique pas d’entrée pour un identifiant introuvable localement", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ question: "Compare cette activité à mes séances similaires." }) }));
    const payload = await response.json();
    expect(payload.activityLookup).toEqual({});
  });
});
