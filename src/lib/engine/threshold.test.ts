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

describe("seuil observé sans FC seuil de la montre (zones en % de FC max)", () => {
  const floors = [120, 134, 148, 161, 176];

  it("retient des répétitions longues courues en Z4 du profil, avec une mention indicative", () => {
    const estimate = estimateThreshold({ runs: [run("2026-11-13", { averageSpeedMps: 1000 / 300, averageHeartRateBpm: 168 })], today, watchSpeedMps: null, thresholdHeartRateBpm: null, zoneFloors: floors });
    expect(estimate.source).toBe("observed");
    expect(Math.round(1000 / (estimate.speedMps as number))).toBe(300);
    expect(estimate.basis).toContain("indicatif : la montre ne donne pas de FC seuil");
  });

  it("écarte des répétitions en Z3 ou en Z5 ; sans zones, rien", () => {
    const runs = [run("2026-11-10", { averageHeartRateBpm: 158 }), run("2026-11-12", { averageHeartRateBpm: 178 })];
    expect(thresholdEvidence(runs, today, null, floors)).toEqual([]);
    expect(estimateThreshold({ runs: [run("2026-11-13", { averageHeartRateBpm: 168 })], today, watchSpeedMps: null, thresholdHeartRateBpm: null }).source).toBe("none");
  });
});

describe("seuil indicatif sans montre", () => {
  const floors = [123, 136, 150, 163, 179];

  it("répétitions de 3 à 6 min courues en Z4 (FC un peu basse tolérée) : seuil indicatif pour donner des allures", () => {
    const runs = [run("2026-11-04", { reps: 3, averageDurationS: 314, averageDistanceM: 1000, averageSpeedMps: 1000 / 313, averageHeartRateBpm: 165 }), run("2026-11-17", { reps: 3, averageDurationS: 309, averageDistanceM: 1010, averageSpeedMps: 1000 / 306, averageHeartRateBpm: 161 })];
    const estimate = estimateThreshold({ runs, today: "2026-11-25", watchSpeedMps: null, thresholdHeartRateBpm: null, zoneFloors: floors });
    expect(estimate.source).toBe("observed");
    expect(Math.round(1000 / (estimate.speedMps as number))).toBe(310);
  });

  it("répétitions trop courtes (2 min) : pas de seuil tiré", () => {
    const runs = [run("2026-11-17", { reps: 5, averageDurationS: 130, averageDistanceM: 480, averageSpeedMps: 1000 / 276, averageHeartRateBpm: 165 })];
    expect(estimateThreshold({ runs, today: "2026-11-25", watchSpeedMps: null, thresholdHeartRateBpm: null, zoneFloors: floors }).source).toBe("none");
  });

  it("course récente (semi en 1:23:43) ramenée à l'allure tenable une heure", () => {
    const semi = { localDate: "2026-11-15", movingTimeS: 5023, metrics: { ...run("2026-11-15", null).metrics, structure: "continuous" as const, kind: "threshold" as const, mainSpeedMps: 21_240 / 5023, mainHeartRateBpm: 140 } };
    const estimate = estimateThreshold({ runs: [semi], today: "2026-11-25", watchSpeedMps: null, thresholdHeartRateBpm: 151, zoneFloors: [86, 103, 120, 137, 154] });
    expect(estimate.source).toBe("observed");
    expect(Math.round(1000 / (estimate.speedMps as number))).toBe(232);
    expect(estimate.basis).toMatch(/allure tenable une heure/);
  });

  it("footing en Z2 : jamais pris pour un effort de seuil", () => {
    const easy = { localDate: "2026-11-15", movingTimeS: 3600, metrics: { ...run("2026-11-15", null).metrics, structure: "continuous" as const, kind: "endurance" as const, mainSpeedMps: 1000 / 380, mainHeartRateBpm: 140 } };
    expect(estimateThreshold({ runs: [easy], today: "2026-11-25", watchSpeedMps: null, thresholdHeartRateBpm: null, zoneFloors: floors }).source).toBe("none");
  });
});
