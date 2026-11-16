import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { createSyncedActivityRepository } from "@/lib/db/repositories/synced-activity-repository";
import { buildActivityLookup, extractEvidenceActivityIds, parseStoredConversationEvidence } from "./evidence-labels";

describe("extractEvidenceActivityIds", () => {
  it("déduplique et ignore les preuves agrégées sans activityId", () => {
    const ids = extractEvidenceActivityIds([
      { evidence: [{ activityId: "i1", label: "Allure", value: "4:30/km" }, { activityId: null, label: "Volume", value: "42 km" }] },
      { evidence: [{ activityId: "i1", label: "FC", value: "150 bpm" }, { activityId: "i2", label: "Allure", value: "4:40/km" }] },
    ]);
    expect(ids.sort()).toEqual(["i1", "i2"]);
  });

  it("renvoie une liste vide sans preuve", () => {
    expect(extractEvidenceActivityIds([{ evidence: [] }])).toEqual([]);
  });
});

describe("parseStoredConversationEvidence", () => {
  it("extrait les preuves d’un message assistant valide", () => {
    const contentJson = JSON.stringify({ evidence: [{ activityId: "i1", label: "Allure", value: "4:30/km" }] });
    expect(parseStoredConversationEvidence(contentJson)).toEqual([{ activityId: "i1" }]);
  });

  it("renvoie une liste vide sur un JSON illisible plutôt que de lancer une exception", () => {
    expect(parseStoredConversationEvidence("pas du json")).toEqual([]);
  });

  it("renvoie une liste vide quand evidence est absent ou n’est pas un tableau", () => {
    expect(parseStoredConversationEvidence(JSON.stringify({ summary: "ok" }))).toEqual([]);
    expect(parseStoredConversationEvidence(JSON.stringify({ evidence: "pas un tableau" }))).toEqual([]);
  });

  it("tolère un message utilisateur (texte brut, pas un objet)", () => {
    expect(parseStoredConversationEvidence(JSON.stringify("Quelle est ma progression ?"))).toEqual([]);
  });
});

describe("buildActivityLookup", () => {
  let sqlite: Database.Database;
  let database: AppDatabase;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    applyMigrations(sqlite);
    database = drizzle(sqlite, { schema });
  });

  it("résout les identifiants connus localement et ignore les identifiants absents", async () => {
    const repo = createSyncedActivityRepository(database);
    await repo.upsert({
      id: "row-1", intervalsActivityId: "i1", startDate: "2026-08-01T07:00:00.000Z", timezone: null, name: "Sortie facile",
      sportType: "Run", distanceM: 8000, movingTimeS: 2400, elapsedTimeS: 2450, elevationGainM: 40,
      averageSpeedMps: 3.3, averageHeartRateBpm: 140, maxHeartRateBpm: 160, averageCadenceSpm: 170, averagePowerW: null,
      trainingLoad: null, sourceUpdatedAt: null, syncedAt: "2026-08-01T08:00:00.000Z", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-01T08:00:00.000Z",
    });

    const lookup = await buildActivityLookup(database, ["i1", "i-inconnu"]);

    expect(lookup).toEqual({ i1: { date: "2026-08-01T07:00:00.000Z", name: "Sortie facile" } });
  });

  it("renvoie un objet vide sans identifiant", async () => {
    expect(await buildActivityLookup(database, [])).toEqual({});
  });
});
