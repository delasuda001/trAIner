import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema, syncedActivities, activityStreamSummaries, analyses } from "@/lib/db/schema";
import type { AppDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/testing/apply-migrations";
import { buildPerformanceProfile } from "./performance-profile";
import { STREAM_SUMMARY_VERSION } from "./stream-summary";

vi.mock("server-only", () => ({}));

let sqlite: Database.Database;
let database: AppDatabase;
const BASE_MS = Date.now();
const nowIso = new Date(BASE_MS).toISOString();
const weeksAgo = (n: number) => new Date(BASE_MS - n * 7 * 24 * 60 * 60 * 1000).toISOString();

function debrief(takeaway: string) {
  return JSON.stringify({
    key_takeaways: [takeaway],
    summary: "s", observed_facts: [], historical_comparison: null, zone_classification_summary: "z",
    technical_recommendations: [], next_session_pace_guidance: null, hypotheses: [], limitations: [], next_steps: [], safety_note: null,
  });
}

function streamSummary(efforts: Array<{ durationS: number; speedMps: number; hr: number | null }>) {
  return JSON.stringify({
    version: STREAM_SUMMARY_VERSION,
    computedAt: nowIso,
    sampleCount: 1800,
    bestEfforts: efforts.map((e) => ({ durationS: e.durationS, actualElapsedS: e.durationS, distanceM: e.speedMps * e.durationS, speedMps: e.speedMps, meanHeartRateBpm: e.hr })),
  });
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  database = drizzle(sqlite, { schema });
});
afterEach(() => sqlite.close());

describe("buildPerformanceProfile", () => {
  it("agrège le meilleur effort par durée sur plusieurs activités et les débriefs récents", async () => {
    await database.insert(syncedActivities).values([
      { id: "a1", intervalsActivityId: "i1", startDate: weeksAgo(1), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 188, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso },
      { id: "a2", intervalsActivityId: "i2", startDate: weeksAgo(6), sportType: "Run", distanceM: 10000, maxHeartRateBpm: 185, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso },
    ]);
    await database.insert(activityStreamSummaries).values([
      { id: "s1", intervalsActivityId: "i1", streamVersion: STREAM_SUMMARY_VERSION, summaryJson: streamSummary([{ durationS: 600, speedMps: 5.0, hr: 176 }, { durationS: 1800, speedMps: 4.2, hr: 170 }]), createdAt: nowIso, updatedAt: nowIso },
      { id: "s2", intervalsActivityId: "i2", streamVersion: STREAM_SUMMARY_VERSION, summaryJson: streamSummary([{ durationS: 600, speedMps: 4.0, hr: 168 }, { durationS: 1800, speedMps: 4.5, hr: 172 }]), createdAt: nowIso, updatedAt: nowIso },
    ]);
    await database.insert(analyses).values([
      { id: "an1", intervalsActivityId: "i1", deterministicMetricsJson: "{}", llmResponseJson: debrief("Régularité en hausse"), llmModel: "m", promptVersion: "1.2", createdAt: weeksAgo(1), updatedAt: weeksAgo(1) },
      { id: "an2", intervalsActivityId: "i2", deterministicMetricsJson: "{}", llmResponseJson: debrief("Fin de séance en dérive"), llmModel: "m", promptVersion: "1.2", createdAt: weeksAgo(6), updatedAt: weeksAgo(6) },
    ]);

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));

    // 600 s : meilleur = i1 à 5.0 m/s -> 200 s/km -> "3:20" ; 1800 s : meilleur = i2 à 4.5 m/s -> "3:42"
    const e600 = profile.bestEfforts.find((e) => e.durationS === 600)!;
    const e1800 = profile.bestEfforts.find((e) => e.durationS === 1800)!;
    expect(e600).toMatchObject({ paceMinKm: "3:20", activityId: "i1", activityDate: weeksAgo(1) });
    expect(e1800).toMatchObject({ paceMinKm: "3:42", activityId: "i2", activityDate: weeksAgo(6) });

    expect(profile.estimateWindowWeeks).toBe(20);
    expect(profile.activitiesWithStreamSummary).toBe(2);
    expect(profile.activitiesWithStreamSummaryInWindow).toBe(2);
    expect(profile.totalRunningActivities).toBe(2);
    expect(profile.recentKeyTakeaways).toEqual(["Régularité en hausse", "Fin de séance en dérive"]);
    expect(["insufficient", "low", "moderate", "good"]).toContain(profile.thresholdConfidence);
    expect(profile.weeklyVolume.recentAverageKm).toBeGreaterThan(0);
  });

  it("retourne un profil vide cohérent sans aucune donnée", async () => {
    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));
    expect(profile.bestEfforts).toEqual([]);
    expect(profile.thresholdPaceMinKm).toBeNull();
    expect(profile.thresholdConfidence).toBe("insufficient");
    expect(profile.recentKeyTakeaways).toEqual([]);
    expect(profile.activitiesWithStreamSummary).toBe(0);
    expect(profile.totalRunningActivities).toBe(0);
    expect(profile.weeklyVolume.recentAverageKm).toBeNull();
  });

  it("ignore les résumés d'une version de format différente", async () => {
    await database.insert(syncedActivities).values({ id: "a1", intervalsActivityId: "i1", startDate: weeksAgo(1), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 188, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso });
    await database.insert(activityStreamSummaries).values({ id: "s-old", intervalsActivityId: "i1", streamVersion: "0", summaryJson: streamSummary([{ durationS: 600, speedMps: 9.9, hr: 180 }]), createdAt: nowIso, updatedAt: nowIso });
    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));
    expect(profile.bestEfforts).toEqual([]);
    expect(profile.activitiesWithStreamSummary).toBe(0);
  });

  it("réutilise une base d'efforts déjà calculée sans relire le cache", async () => {
    // Aucune ligne activity_stream_summaries insérée : si buildPerformanceProfile
    // relisait le cache, bestEfforts serait vide.
    await database.insert(syncedActivities).values({ id: "a1", intervalsActivityId: "i1", startDate: weeksAgo(2), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 190, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso });
    const basis = {
      windowWeeks: 20,
      windowStartIso: weeksAgo(20),
      efforts: [
        { durationS: 600, speedMps: 5.0, meanHeartRateBpm: 176, activityId: "i1", activityDateIso: weeksAgo(2) },
        { durationS: 1200, speedMps: 4.6, meanHeartRateBpm: 172, activityId: "i1", activityDateIso: weeksAgo(2) },
      ],
      globalMaxHeartRateBpm: 190,
      activitiesWithSummaryInWindow: 1,
      activitiesWithSummaryTotal: 1,
    };

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS), basis);
    expect(profile.bestEfforts.map((e) => e.durationS)).toEqual([600, 1200]);
    expect(profile.bestEfforts[0]).toMatchObject({ paceMinKm: "3:20", activityId: "i1", activityDate: weeksAgo(2) });
    expect(profile.activitiesWithStreamSummaryInWindow).toBe(1);
    expect(profile.thresholdConfidence).not.toBe("insufficient");
  });

  it("marque chaque meilleur effort utilisé/écarté avec son motif", async () => {
    await database.insert(syncedActivities).values({ id: "a1", intervalsActivityId: "i1", startDate: weeksAgo(2), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 190, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso });
    // Efforts courts maximaux + efforts longs non maximaux (cf. bug de seuil trop lent).
    await database.insert(activityStreamSummaries).values({
      id: "s1", intervalsActivityId: "i1", streamVersion: STREAM_SUMMARY_VERSION, createdAt: nowIso, updatedAt: nowIso,
      summaryJson: streamSummary([
        { durationS: 180, speedMps: 5.0, hr: 186 },
        { durationS: 300, speedMps: 4.65, hr: 182 },
        { durationS: 600, speedMps: 4.2, hr: 178 },
        { durationS: 1200, speedMps: 3.6, hr: 165 },
        { durationS: 1800, speedMps: 3.42, hr: 152 },
      ]),
    });

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));
    const byDuration = new Map(profile.bestEfforts.map((e) => [e.durationS, e]));

    expect(byDuration.get(180)!.status).toBe("used");
    expect(byDuration.get(600)!.status).toBe("used");
    expect(byDuration.get(1200)!.status).toBe("rejected");
    expect(byDuration.get(1200)!.rejectionReason).toMatch(/Dégradation/);
    expect(byDuration.get(1800)!.status).toBe("rejected");
    expect(byDuration.get(1800)!.rejectionReason).not.toBeNull();
  });

  it("ne compte qu'une analyse par activité pour les points clés (la plus récente)", async () => {
    await database.insert(syncedActivities).values({ id: "a1", intervalsActivityId: "i1", startDate: weeksAgo(2), sportType: "Run", distanceM: 10000, maxHeartRateBpm: 188, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso });
    await database.insert(analyses).values([
      { id: "an-old", intervalsActivityId: "i1", deterministicMetricsJson: "{}", llmResponseJson: debrief("Version initiale"), llmModel: "m", promptVersion: "1.2", createdAt: weeksAgo(2), updatedAt: weeksAgo(2) },
      { id: "an-regen", intervalsActivityId: "i1", deterministicMetricsJson: "{}", llmResponseJson: debrief("Version régénérée"), llmModel: "m", promptVersion: "1.3", createdAt: weeksAgo(1), updatedAt: weeksAgo(1) },
    ]);

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));
    expect(profile.recentKeyTakeaways).toEqual(["Version régénérée"]);
  });

  it("expose la note de péremption même en confiance « good » (ancrage périmé, §2 audit)", async () => {
    // i-fresh : efforts courts récents ; i-old : efforts longs de 19 semaines.
    await database.insert(syncedActivities).values([
      { id: "af", intervalsActivityId: "i-fresh", startDate: weeksAgo(2), sportType: "Run", distanceM: 8000, maxHeartRateBpm: 190, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso },
      { id: "ao", intervalsActivityId: "i-old", startDate: weeksAgo(19), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 190, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso },
    ]);
    await database.insert(activityStreamSummaries).values([
      { id: "sf", intervalsActivityId: "i-fresh", streamVersion: STREAM_SUMMARY_VERSION, createdAt: nowIso, updatedAt: nowIso,
        summaryJson: streamSummary([{ durationS: 180, speedMps: 5.0, hr: 186 }, { durationS: 300, speedMps: 4.65, hr: 182 }]) },
      { id: "so", intervalsActivityId: "i-old", streamVersion: STREAM_SUMMARY_VERSION, createdAt: nowIso, updatedAt: nowIso,
        summaryJson: streamSummary([{ durationS: 600, speedMps: 4.2, hr: 178 }, { durationS: 1200, speedMps: 3.9, hr: 168 }, { durationS: 1800, speedMps: 3.7, hr: 158 }]) },
    ]);

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));

    expect(profile.bestEfforts.every((e) => e.status === "used")).toBe(true); // les 5 points passent le filtre
    expect(profile.thresholdConfidence).toBe("good"); // 5 points, 3 zones couvertes
    expect(profile.thresholdFreshnessStale).toBe(false); // au moins un point < 8 semaines
    expect(profile.thresholdStalePointCount).toBe(3); // les efforts longs de 19 semaines
    expect(profile.thresholdOldestRetainedPointWeeks).toBeGreaterThanOrEqual(18.9);
    expect(profile.thresholdOldestRetainedPointWeeks).toBeLessThanOrEqual(19.1);
    // La note de péremption est présente et non conditionnée à la confiance.
    expect(profile.thresholdStaleMessage).toContain("3 des 5 efforts retenus datent de plus de 8 semaines");
  });

  it("borne la lecture des analyses et retient bien les 5 activités distinctes les plus récentes", async () => {
    // 6 activités, 2 analyses chacune (12 lignes) — la plus récente de chaque compte.
    const ids = ["iA", "iB", "iC", "iD", "iE", "iF"];
    await database.insert(syncedActivities).values(ids.map((id, i) => ({ id: `s${id}`, intervalsActivityId: id, startDate: weeksAgo(i + 1), sportType: "Run", distanceM: 8000, maxHeartRateBpm: 188, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso })));
    const rows: { id: string; intervalsActivityId: string; deterministicMetricsJson: string; llmResponseJson: string; llmModel: string; promptVersion: string; createdAt: string; updatedAt: string }[] = [];
    ids.forEach((id, i) => {
      // ancienne analyse
      rows.push({ id: `an-${id}-old`, intervalsActivityId: id, deterministicMetricsJson: "{}", llmResponseJson: debrief(`${id} ancienne`), llmModel: "m", promptVersion: "1.2", createdAt: weeksAgo(20 + i), updatedAt: weeksAgo(20 + i) });
      // analyse récente (créée dans l'ordre : iA la plus récente ... iF la plus ancienne des récentes)
      rows.push({ id: `an-${id}-new`, intervalsActivityId: id, deterministicMetricsJson: "{}", llmResponseJson: debrief(`${id} récente`), llmModel: "m", promptVersion: "1.3", createdAt: new Date(BASE_MS - i * 60_000).toISOString(), updatedAt: nowIso });
    });
    await database.insert(analyses).values(rows);

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));

    // 5 activités distinctes les plus récentes = iA..iE, version récente uniquement (pas de doublon "ancienne").
    expect(profile.recentKeyTakeaways).toEqual(["iA récente", "iB récente", "iC récente", "iD récente", "iE récente"]);
  });

  it("exclut de l'estimation les résumés hors fenêtre de 20 semaines mais les compte dans le total", async () => {
    await database.insert(syncedActivities).values([
      { id: "a-in", intervalsActivityId: "i-in", startDate: weeksAgo(4), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 188, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso },
      { id: "a-out", intervalsActivityId: "i-out", startDate: weeksAgo(30), sportType: "Run", distanceM: 12000, maxHeartRateBpm: 188, syncedAt: nowIso, createdAt: nowIso, updatedAt: nowIso },
    ]);
    await database.insert(activityStreamSummaries).values([
      { id: "s-in", intervalsActivityId: "i-in", streamVersion: STREAM_SUMMARY_VERSION, summaryJson: streamSummary([{ durationS: 600, speedMps: 4.1, hr: 172 }]), createdAt: nowIso, updatedAt: nowIso },
      { id: "s-out", intervalsActivityId: "i-out", streamVersion: STREAM_SUMMARY_VERSION, summaryJson: streamSummary([{ durationS: 600, speedMps: 9.9, hr: 185 }]), createdAt: nowIso, updatedAt: nowIso },
    ]);

    const profile = await buildPerformanceProfile(database, new Date(BASE_MS));
    expect(profile.bestEfforts.map((e) => e.activityId)).toEqual(["i-in"]);
    expect(profile.activitiesWithStreamSummaryInWindow).toBe(1);
    expect(profile.activitiesWithStreamSummary).toBe(2);
  });
});
