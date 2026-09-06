import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "../db/client";
import { buildConversationContext, classifyQuestionAndSelectScope } from "./conversation-context";

vi.mock("server-only", () => ({}));
vi.mock("../db/repositories/synced-activity-repository", () => ({
  createSyncedActivityRepository: () => ({
    findByExternalId: async (id: string) => ({ intervalsActivityId: id, startDate: "2026-09-01T10:00:00.000Z", name: "Séance", sportType: "Run", distanceM: 5000, movingTimeS: 1500, averageSpeedMps: 3.3, averageHeartRateBpm: 150, averageCadenceSpm: 175, elevationGainM: 20 }),
    findByPeriod: async () => [{ intervalsActivityId: "i180188518", startDate: "2026-09-01T10:00:00.000Z", name: "Séance", sportType: "Run", distanceM: 5000, movingTimeS: 1500, averageSpeedMps: 3.3, averageHeartRateBpm: 150, averageCadenceSpm: 175, elevationGainM: 20 }],
  }),
}));
vi.mock("../db/repositories/goal-repository", () => ({
  createGoalRepository: () => ({ findByStatus: async () => [{ id: "goal-1", title: "10 km", type: "race", targetValue: 10, targetUnit: "km" }] }),
}));

const database = {} as AppDatabase;

describe("conversation context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sélectionne une activité précise", async () => {
    await expect(classifyQuestionAndSelectScope("Que s'est-il passé sur i180188518 ?", database)).resolves.toMatchObject({ kind: "activity", activityIds: ["i180188518"] });
  });

  it("sélectionne une période pour une tendance", async () => {
    await expect(classifyQuestionAndSelectScope("Comment ma cadence évolue-t-elle sur les sorties faciles ?", database)).resolves.toMatchObject({ kind: "trend", activityIds: [] });
  });

  it("sélectionne un objectif pour une question d'objectif", async () => {
    await expect(classifyQuestionAndSelectScope("Cette séance était-elle cohérente avec mon objectif actuel ?", database)).resolves.toMatchObject({ kind: "goal", goalId: "goal-1" });
  });

  it("ne contient ni streams, ni GPS, ni séances manuelles", async () => {
    const context = await buildConversationContext("Compare mes dernières séances", database);
    expect(context.selectedActivities[0]).not.toHaveProperty("streams");
    expect(context.selectedActivities[0]).not.toHaveProperty("gps");
    expect(JSON.stringify(context)).not.toContain("manual_sessions");
  });
});