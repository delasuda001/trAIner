import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "./activity-metrics";
import { estimateThreshold, thresholdEvidence } from "./threshold";

type Work = NonNullable<ActivityMetrics["work"]>;

function run(localDate: string, work: Partial<Work> | null, elevationGainPerKm = 3): { localDate: string; metrics: ActivityMetrics } {
  const fullWork: Work | null = work
    ? { reps: 3, averageDurationS: 500, averageDistanceM: 2000, averageSpeedMps: 1000 / 250, averageHeartRateBpm: 168, peakHeartRateBpm: 174, speedCvPct: 1, fadePct: 0, paceSpreadSPerKm: 6, fadeSPerKm: 0, averageRecoveryS: 120, repsDetail: [], ...work }
    : null;
  return { localDate, metrics: { version: 12, restingHeartRateUsed: 46, kind: "intervals_threshold", family: "intervals", structure: "intervals", mainSpeedMps: 3.5, mainHeartRateBpm: 160, halves: null, work: fullWork, aerobic: null, zoneShares: null, elevationGainPerKm, averageCadenceSpm: 170, blocks: null, dynamics: null } };
}

const WATCH = 1000 / 261; // 4:21/km
const today = "2026-11-18";

describe("seuil observé en séance", () => {
  it("retient un 3 × 2 km récent couru à la FC seuil et le préfère à la montre s'il est plus rapide de 8 s/km ou plus", () => {
    const estimate = estimateThreshold({ runs: [run("2026-11-13", {})], today, watchSpeedMps: WATCH, thresholdHeartRateBpm: 169 });
    expect(estimate.source).toBe("observed");
    expect(Math.round(1000 / (estimate.speedMps as number))).toBe(250);
    expect(estimate.basis).toBe("seuil observé 4:10/km (3 × 2 km du 13 nov. à 4:10/km pour 168 bpm), la montre l'estime à 4:21/km");
  });

  it("garde la montre si l'écart est inférieur à 8 s/km", () => {
    const estimate = estimateThreshold({ runs: [run("2026-11-13", { averageSpeedMps: 1000 / 255 })], today, watchSpeedMps: WATCH, thresholdHeartRateBpm: 169 });
    expect(estimate.source).toBe("watch");
    expect(estimate.speedMps).toBe(WATCH);
    expect(estimate.basis).toBe("seuil montre 4:21/km");
  });

  it("écarte les séances trop anciennes (plus de 8 semaines), trop courtes, trop intenses, trop faciles ou vallonnées", () => {
    const runs = [
      run("2026-09-01", {}), // hors fenêtre
      run("2026-11-01", { reps: 4, averageDurationS: 120, averageDistanceM: 500 }), // répétitions courtes
      run("2026-11-02", { reps: 2, averageDurationS: 400, averageDistanceM: 1600 }), // 13 min de travail seulement
      run("2026-11-04", { averageHeartRateBpm: 175 }), // au-dessus du seuil : allure > seuil
      run("2026-11-06", { averageHeartRateBpm: 160 }), // trop facile
      run("2026-11-08", {}, 15), // vallonné
    ];
    expect(thresholdEvidence(runs, today, 169)).toEqual([]);
    expect(estimateThreshold({ runs, today, watchSpeedMps: WATCH, thresholdHeartRateBpm: 169 }).source).toBe("watch");
  });

  it("fait la moyenne des allures des 3 séances retenues les plus récentes", () => {
    const runs = [run("2026-10-01", { averageSpeedMps: 1000 / 240 }), run("2026-10-20", { averageSpeedMps: 1000 / 250 }), run("2026-11-01", { averageSpeedMps: 1000 / 248 }), run("2026-11-13", { averageSpeedMps: 1000 / 252 })];
    const estimate = estimateThreshold({ runs, today, watchSpeedMps: WATCH, thresholdHeartRateBpm: 169 });
    expect(estimate.evidence.map((entry) => entry.localDate)).toEqual(["2026-11-13", "2026-11-01", "2026-10-20"]);
    expect(Math.round(1000 / (estimate.speedMps as number))).toBe(250);
  });

  it("sans FC seuil connue, n'observe rien ; sans montre ni preuve, seuil inconnu", () => {
    expect(estimateThreshold({ runs: [run("2026-11-13", {})], today, watchSpeedMps: WATCH, thresholdHeartRateBpm: null }).source).toBe("watch");
    expect(estimateThreshold({ runs: [], today, watchSpeedMps: null, thresholdHeartRateBpm: 169 })).toMatchObject({ source: "none", speedMps: null });
  });
});
