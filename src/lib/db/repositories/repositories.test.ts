import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { applyMigrations } from "../testing/apply-migrations";
import { createAthleteContextRepository } from "./athlete-context-repository";
import { createConfirmationRepository } from "./confirmation-repository";
import { createGoalRepository } from "./goal-repository";
import { createManualSessionRepository } from "./manual-session-repository";
import { createSyncedActivityRepository } from "./synced-activity-repository";
import { createConversationRepository } from "./conversation-repository";
import { createAnalysisRepository, parseStoredAnalysis } from "./analysis-repository";
import { createActivityContextRepository } from "./activity-context-repository";
import { createStreamSummaryRepository } from "./stream-summary-repository";
import { schema } from "../schema";
import type { AppDatabase } from "../client";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const now = "2026-08-25T12:00:00.000Z";

function syncedInput(overrides: Record<string, unknown> = {}) {
  return { id: "sync-1", intervalsActivityId: "i179394628", startDate: now, sportType: "Run", syncedAt: now, createdAt: now, updatedAt: now, ...overrides };
}

beforeEach(() => { sqlite = new Database(":memory:"); applyMigrations(sqlite); database = drizzle(sqlite, { schema }); });
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
    const context = { version: 1, athleteProfile: {}, performanceReferences: [], priorities: { secondary: [] }, weeklyTemplate: {}, coachingPreferences: { wantsCriticalDataGroundedFeedback: true, wantsTrainingScenariosToReview: true, wantsSourcesAndLimitationsAlwaysVisible: true } };
    await repository.create({ id: "context-1", status: "draft", contextJson: JSON.stringify(context), sourceText: null, createdAt: now, activatedAt: null, archivedAt: null, updatedAt: now });
    await repository.create({ id: "context-2", status: "draft", contextJson: JSON.stringify({ ...context, priorities: { primary: "10 km", secondary: [] } }), sourceText: null, createdAt: now, activatedAt: null, archivedAt: null, updatedAt: now });
    await repository.activate("context-1");
    await repository.activate("context-2");
    await expect(repository.findActive()).resolves.toMatchObject({ id: "context-2" });
    expect(sqlite.prepare("select count(*) as count from athlete_context_versions where status = 'active'").get()).toMatchObject({ count: 1 });
  });

  it("remplace transactionnellement l’objectif principal actif", async () => {
    const repository = createGoalRepository(database);
    const input = { title: "10 km", type: "race", priority: "primary" as const, status: "active" as const, definitionJson: JSON.stringify({ distanceKm: 10 }), createdAt: now, updatedAt: now };
    await repository.create({ ...input, id: "goal-1" });
    await repository.create({ ...input, id: "goal-2" });
    expect(sqlite.prepare("select count(*) as count from goals where priority = 'primary' and status = 'active'").get()).toMatchObject({ count: 1 });
  });

  it("garde les repositories de course structurellement séparés des séances manuelles", async () => {
    const manualRepository = createManualSessionRepository(database);
    const syncedRepository = createSyncedActivityRepository(database);
    await manualRepository.create({ id: "manual-1", sessionDate: "2026-08-25", discipline: "strength_training", durationMinutes: 45, createdAt: now, updatedAt: now });
    await syncedRepository.upsert(syncedInput());
    await expect(syncedRepository.findByPeriod("2026-08-25T00:00:00.000Z", "2026-08-25T23:59:59.999Z")).resolves.toHaveLength(1);
  });

  it("signale une analyse persistée dans un ancien format sans planter à la lecture", async () => {
    const repository = createAnalysisRepository(database);
    // Payload conforme au contrat de réponse *avant* l'ajout de key_takeaways.
    const legacyResponse = {
      summary: "Séance de seuil régulière.",
      observed_facts: ["Allure stable autour de 4:10/km."],
      historical_comparison: null,
      zone_classification_summary: "Majoritairement en zone seuil.",
      technical_recommendations: [],
      next_session_pace_guidance: null,
      hypotheses: [],
      limitations: ["Comparaison historique indisponible."],
      questions_to_consider: [],
      next_steps: [],
      safety_note: null,
    };
    await repository.create({
      id: "analysis-legacy",
      intervalsActivityId: "i179394628",
      deterministicMetricsJson: "{}",
      historicalComparisonJson: null,
      llmResponseJson: JSON.stringify(legacyResponse),
      llmModel: "gemini-legacy",
      promptVersion: "1.0",
      createdAt: now,
      updatedAt: now,
    });

    const stored = await repository.findLatestByActivityId("i179394628");
    expect(stored).toBeDefined();

    const parsed = parseStoredAnalysis(stored!);
    expect(parsed.status).toBe("outdated");
    if (parsed.status === "outdated") {
      expect(parsed.issues.some((issue) => issue.includes("key_takeaways"))).toBe(true);
    }

    // Une analyse "1.1" (avec key_takeaways ET l'ancien questions_to_consider)
    // reste lisible sous le contrat 1.2 : le champ retiré est simplement strippé.
    await repository.create({
      id: "analysis-current",
      intervalsActivityId: "i179394628",
      deterministicMetricsJson: "{}",
      historicalComparisonJson: null,
      llmResponseJson: JSON.stringify({ ...legacyResponse, key_takeaways: ["Séance réussie."], questions_to_consider: ["ancienne question"] }),
      llmModel: "gemini-3.8-flash",
      promptVersion: "1.1",
      createdAt: "2026-08-25T12:05:00.000Z",
      updatedAt: "2026-08-25T12:05:00.000Z",
    });
    const current = parseStoredAnalysis((await repository.findLatestByActivityId("i179394628"))!);
    expect(current.status).toBe("ok");
    if (current.status === "ok") {
      expect(current.analysis).not.toHaveProperty("questions_to_consider");
      expect(current.analysis.key_takeaways).toEqual(["Séance réussie."]);
    }
  });

  it("upsert le contexte d'activité : crée, relit par intervals_activity_id, met à jour sans dupliquer", async () => {
    const repository = createActivityContextRepository(database);
    const created = await repository.upsert({ id: "ctx-1", intervalsActivityId: "i179394628", sessionGoal: "Tempo", perceivedExertion: "modéré", unusualFatigue: 0, painFlag: 0, note: "RAS", createdAt: now, updatedAt: now });
    expect(created).toMatchObject({ intervalsActivityId: "i179394628", sessionGoal: "Tempo", perceivedExertion: "modéré" });

    await expect(repository.findByActivityId("i179394628")).resolves.toMatchObject({ id: created.id, note: "RAS" });
    await expect(repository.findByActivityId("absent")).resolves.toBeUndefined();

    const updated = await repository.upsert({ id: "ctx-2", intervalsActivityId: "i179394628", sessionGoal: "Seuil", perceivedExertion: "difficile", unusualFatigue: 1, painFlag: 1, note: "Gêne mollet", createdAt: "2099-01-01T00:00:00.000Z", updatedAt: now });
    expect(updated).toMatchObject({ sessionGoal: "Seuil", unusualFatigue: 1, painFlag: 1, note: "Gêne mollet" });
    // La mise à jour préserve l'identité et la date de création de la ligne :
    // l'id "ctx-2" et le createdAt "2099-..." fournis en entrée sont ignorés.
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(now);
    // updatedAt est rafraîchi par le repository, jamais figé à la valeur d'entrée.
    expect(updated.updatedAt).not.toBe(now);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(now));
    expect(sqlite.prepare("select count(*) as count from activity_contexts where intervals_activity_id = 'i179394628'").get()).toMatchObject({ count: 1 });
    await expect(repository.findByActivityId("i179394628")).resolves.toMatchObject({ sessionGoal: "Seuil", note: "Gêne mollet" });

    await expect(repository.findById(updated.id)).resolves.toMatchObject({ intervalsActivityId: "i179394628" });
    await expect(repository.delete(updated.id)).resolves.toBe(true);
    await expect(repository.delete(updated.id)).resolves.toBe(false);
    await expect(repository.findByActivityId("i179394628")).resolves.toBeUndefined();
  });

  it("upsert un résumé de streams par (activité, version) sans dupliquer", async () => {
    const repository = createStreamSummaryRepository(database);
    const payloadV1a = JSON.stringify({ version: "1", bestEfforts: ["initial"] });
    const payloadV1b = JSON.stringify({ version: "1", bestEfforts: ["recalculé"] });

    await repository.upsert({ id: "sum-1", intervalsActivityId: "i179394628", streamVersion: "1", summaryJson: payloadV1a, createdAt: now, updatedAt: now });
    const updated = await repository.upsert({ id: "sum-2", intervalsActivityId: "i179394628", streamVersion: "1", summaryJson: payloadV1b, createdAt: now, updatedAt: "2026-08-25T13:00:00.000Z" });
    expect(updated.summaryJson).toBe(payloadV1b);
    expect(sqlite.prepare("select count(*) as count from activity_stream_summaries where intervals_activity_id = 'i179394628'").get()).toMatchObject({ count: 1 });

    await repository.upsert({ id: "sum-3", intervalsActivityId: "i179394628", streamVersion: "2", summaryJson: JSON.stringify({ version: "2" }), createdAt: now, updatedAt: now });
    expect(sqlite.prepare("select count(*) as count from activity_stream_summaries where intervals_activity_id = 'i179394628'").get()).toMatchObject({ count: 2 });

    await expect(repository.findByActivityAndVersion("i179394628", "1")).resolves.toMatchObject({ summaryJson: payloadV1b });
    await expect(repository.listByVersion("1")).resolves.toHaveLength(1);
  });

  it("crée un thread, ajoute deux messages et relit son historique", async () => {
    const repository = createConversationRepository(database);
    await repository.createThread({ id: "thread-1", title: "Question", goalId: null, createdAt: now, updatedAt: now });
    await repository.addMessage({ id: "message-1", threadId: "thread-1", role: "user", contentJson: "Question initiale", createdAt: now });
    await repository.addMessage({ id: "message-2", threadId: "thread-1", role: "assistant", contentJson: JSON.stringify({ summary: "Réponse" }), model: "gemini-3.8-flash", promptVersion: "1.0", createdAt: "2026-08-25T12:01:00.000Z" });
    await expect(repository.findThread("thread-1")).resolves.toMatchObject({ title: "Question" });
    await expect(repository.listMessages("thread-1")).resolves.toMatchObject([
      { id: "message-1", role: "user", model: null, promptVersion: null },
      { id: "message-2", role: "assistant", model: "gemini-3.8-flash", promptVersion: "1.0" },
    ]);
  });
});