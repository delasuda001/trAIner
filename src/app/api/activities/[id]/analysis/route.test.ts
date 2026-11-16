import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, analyses } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import * as dbClient from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const now = "2026-09-01T00:00:00.000Z";

const debriefPayload = {
  level1: {
    verdict: "well_executed",
    verdictEvidence: [{ metric: "pace_cv_work_segments", currentValue: 1, comparisonValue: null, unit: "%", direction: "n/a", label: "Variation d'allure de 1 % sur les segments analysés." }],
    notableVsHistory: null, mainFocus: null, nextExperiment: null,
  },
  summary: "s", observed_facts: [], historical_comparison: null, zone_classification_summary: "z",
  technical_recommendations: [], next_session_pace_guidance: null, hypotheses: [], limitations: [], next_steps: [], safety_note: null,
};

const storedThreshold = {
  criticalSpeedMps: 4.1,
  thresholdPaceMinKm: "4:04",
  dprimM: 120,
  validPointCount: 3,
  confidenceLevel: "low",
  basis: "recent_history",
  windowWeeks: 20,
  usedDeclaredReferenceFallback: false,
  retainedPoints: [{ durationS: 600, activityId: "i1", activityDate: "2026-08-10T00:00:00.000Z" }],
  coverageByZone: { short: false, medium: true, long: false },
  missingZones: ["short", "long"],
  suggestedSessions: [{ missingZone: "short", suggestion: "Fractionné court" }],
  biasHint: null,
  staleWarning: { isStale: false, lastValidDaysAgo: 12, stalePointCount: 1, oldestRetainedPointWeeks: 15, message: "1 des 3 efforts retenus datent de plus de 8 semaines (le plus ancien : 15 semaines)." },
  rejectedPoints: [],
};

function insertAnalysis(id: string, activityId: string, createdAt: string, deterministic: unknown, promptVersion = "1.2") {
  return database.insert(analyses).values({
    id, intervalsActivityId: activityId, deterministicMetricsJson: JSON.stringify(deterministic),
    historicalComparisonJson: null, llmResponseJson: JSON.stringify(debriefPayload), llmModel: "gemini-test", promptVersion,
    createdAt, updatedAt: createdAt,
  });
}

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

describe("GET /api/activities/[id]/analysis", () => {
  it("renvoie la provenance du seuil depuis deterministic_metrics_json", async () => {
    await insertAnalysis("an-1", "i1", now, { threshold: storedThreshold, segmentZones: [], historicalComparison: null });

    const response = await GET(new Request("http://localhost"), params("i1"));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.thresholdEstimate).toMatchObject({
      thresholdPaceMinKm: "4:04",
      confidenceLevel: "low",
      basis: "recent_history",
      windowWeeks: 20,
      usedDeclaredReferenceFallback: false,
      missingZones: ["short", "long"],
    });
    expect(payload.thresholdEstimate.staleWarning.message).toMatch(/plus de 8 semaines/);
    expect(payload.thresholdEstimate.retainedPoints).toHaveLength(1);
  });

  it("renvoie thresholdEstimate: null pour une analyse ancienne sans bloc seuil", async () => {
    await insertAnalysis("an-old", "i2", now, { segmentZones: [], historicalComparison: null });

    const response = await GET(new Request("http://localhost"), params("i2"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ thresholdEstimate: null });
  });

  it("signale logicStale quand prompt_version stocké diffère de la version courante", async () => {
    await insertAnalysis("an-stale", "i3", now, { threshold: storedThreshold }, "1.2");
    const stale = await (await GET(new Request("http://localhost"), params("i3"))).json();
    expect(stale.logicStale).toBe(true);
    expect(stale.promptVersion).toBe("1.2");
    expect(stale.currentPromptVersion).toBe("1.4");
    // le contenu reste affichable (forme valide)
    expect(stale.formatOutdated).toBe(false);
    expect(stale.analysis).not.toBeNull();

    await insertAnalysis("an-fresh", "i4", now, { threshold: storedThreshold }, "1.4");
    const fresh = await (await GET(new Request("http://localhost"), params("i4"))).json();
    expect(fresh.logicStale).toBe(false);
  });

  it("404 quand aucune analyse n'existe", async () => {
    const response = await GET(new Request("http://localhost"), params("absent"));
    expect(response.status).toBe(404);
  });

  it("relit la comparaison historique persistée (comparabilityBreakdown, usedDeclaredReferenceFallback)", async () => {
    const storedComparison = {
      comparableActivitiesCount: 1,
      recentTrendDays: 112,
      insufficientDataReason: null,
      paceDeltaPct: -1.2,
      hrDeltaBpm: null,
      cadenceDeltaSpm: null,
      observations: ["1 séance comparable détectée (structure réellement mesurée) pour cette zone et ce format de répétition."],
      usedDeclaredReferenceFallback: true,
      comparabilityBreakdown: [{ activityId: "i-hist", score: 0.82, tier: "high", guardrailsApplied: [] }],
    };
    await database.insert(analyses).values({
      id: "an-hist", intervalsActivityId: "i5",
      deterministicMetricsJson: JSON.stringify({ historicalComparison: storedComparison }),
      historicalComparisonJson: JSON.stringify(storedComparison),
      llmResponseJson: JSON.stringify(debriefPayload), llmModel: "gemini-test", promptVersion: "1.3",
      createdAt: now, updatedAt: now,
    });

    const response = await GET(new Request("http://localhost"), params("i5"));
    const payload = await response.json();

    expect(payload.historicalComparison).toEqual({
      comparableActivitiesCount: 1,
      insufficientDataReason: null,
      usedDeclaredReferenceFallback: true,
      comparabilityBreakdown: [{ activityId: "i-hist", score: 0.82, tier: "high", guardrailsApplied: [] }],
    });
  });

  it("renvoie historicalComparison: null pour une analyse ancienne sans ce champ", async () => {
    await insertAnalysis("an-old-hist", "i6", now, { threshold: storedThreshold });
    const response = await GET(new Request("http://localhost"), params("i6"));
    const payload = await response.json();
    expect(payload.historicalComparison).toBeNull();
  });
});
