import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createAthleteContextRepository } from "./athlete-context-repository";
import { createConfirmationRepository } from "./confirmation-repository";
import { createGoalRepository } from "./goal-repository";
import { createManualSessionRepository } from "./manual-session-repository";
import { createSyncedActivityRepository } from "./synced-activity-repository";
import { schema } from "../schema";
import type { AppDatabase } from "../client";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const now = "2026-08-25T12:00:00.000Z";

function applyMigration(connection: Database.Database): void {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_previous_marrow.sql"), "utf8");
  connection.exec(migration.replaceAll("--> statement-breakpoint", ""));
}

function syncedInput(overrides: Record<string, unknown> = {}) {
  return { id: "sync-1", intervalsActivityId: "i179394628", startDate: now, sportType: "Run", syncedAt: now, createdAt: now, updatedAt: now, ...overrides };
}

beforeEach(() => { sqlite = new Database(":memory:"); applyMigration(sqlite); database = drizzle(sqlite, { schema }); });
afterEach(() => sqlite.close());

describe("repositories SQLite", () => {
  it("applique la migration et impose l’unicité Intervals", async () => {
    const repository = createSyncedActivityRepository(database);
    await repository.upsert(syncedInput());
    await expect(repository.upsert({ ...syncedInput(), id: "sync-2" })).resolves.toMatchObject({ id: "sync-1" });
    await expect(repository.findByPeriod("2026-08-01T00:00:00.000Z", "2026-08-31T23:59:59.999Z")).resolves.toHaveLength(1);
  });

  it("réalise un upsert sans doublon", async () => {
    const repository = createSyncedActivityRepository(database);
    await repository.upsert(syncedInput({ name: "Avant" }));
    await repository.upsert(syncedInput({ name: "Après", distanceM: 5000 }));
    await expect(repository.findById("sync-1")).resolves.toMatchObject({ name: "Après", distanceM: 5000 });
  });

  it("accepte une séance manuelle valide et rejette une durée non positive ou une date invalide", async () => {
    const repository = createManualSessionRepository(database);
    await expect(repository.create({ id: "manual-1", sessionDate: "2026-08-25", discipline: "mobility", durationMinutes: 30, createdAt: now, updatedAt: now })).resolves.toMatchObject({ sessionDate: "2026-08-25" });
    await expect(repository.create({ id: "manual-2", sessionDate: "2026-08-25", discipline: "swimming", durationMinutes: 0, createdAt: now, updatedAt: now })).rejects.toThrow();
    await expect(repository.create({ id: "manual-3", sessionDate: "2026-8-25", discipline: "other", durationMinutes: 10, createdAt: now, updatedAt: now })).rejects.toThrow();
  });

  it("crée puis résout une confirmation", async () => {
    const repository = createConfirmationRepository(database);
    const created = await repository.create({ id: "confirmation-1", confirmationType: "data_quality_review", status: "detected", sourceActivityId: "i179394628", sourceSegmentId: null, detectionConfidence: "low", proposedPayloadJson: JSON.stringify({ reason: "missing_hr" }), resolvedPayloadJson: null, createdAt: now, resolvedAt: null, updatedAt: now });
    await expect(repository.resolve(created.id, "confirmed", { accepted: true })).resolves.toMatchObject({ status: "confirmed", resolvedPayloadJson: JSON.stringify({ accepted: true }) });
  });

  it("maintient un seul contexte actif dans une transaction", async () => {
    const repository = createAthleteContextRepository(database);
    await repository.create({ id: "context-1", status: "draft", contextJson: JSON.stringify({ goals: [], weekTemplate: [] }), sourceText: null, createdAt: now, activatedAt: null, archivedAt: null, updatedAt: now });
    await repository.create({ id: "context-2", status: "draft", contextJson: JSON.stringify({ goals: ["10 km"], weekTemplate: [] }), sourceText: null, createdAt: now, activatedAt: null, archivedAt: null, updatedAt: now });
    await repository.activate("context-1");
    await repository.activate("context-2");
    await expect(repository.findActive()).resolves.toMatchObject({ id: "context-2" });
    expect(sqlite.prepare("select count(*) as count from athlete_context_versions where status = 'active'").get()).toMatchObject({ count: 1 });
  });

  it("refuse un second objectif principal actif", async () => {
    const repository = createGoalRepository(database);
    const input = { title: "10 km", type: "race", priority: "primary" as const, status: "active" as const, definitionJson: JSON.stringify({ distanceKm: 10 }), createdAt: now, updatedAt: now };
    await repository.create({ ...input, id: "goal-1" });
    await expect(repository.create({ ...input, id: "goal-2" })).rejects.toThrow("Un seul objectif");
  });

  it("garde les repositories de course structurellement séparés des séances manuelles", async () => {
    const manualRepository = createManualSessionRepository(database);
    const syncedRepository = createSyncedActivityRepository(database);
    await manualRepository.create({ id: "manual-1", sessionDate: "2026-08-25", discipline: "strength_training", durationMinutes: 45, createdAt: now, updatedAt: now });
    await syncedRepository.upsert(syncedInput());
    await expect(syncedRepository.findByPeriod("2026-08-25T00:00:00.000Z", "2026-08-25T23:59:59.999Z")).resolves.toHaveLength(1);
  });
});