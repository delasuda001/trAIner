import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { computeProgression, easyRunHeartRates, personalReferenceHeartRate, type ProgressionRun } from "./progression";

const today = "2026-11-15";

function easyRun(daysAgo: number, paceSecPerKm: number, heartRate = 135, overrides: Partial<ProgressionRun> = {}): ProgressionRun {
  const speed = 1000 / paceSecPerKm;
  return {
    id: `r${daysAgo}`,
    localDate: addDays(today, -daysAgo),
    distanceM: 10000,
    sport: "running",
    metrics: { structure: "continuous", family: "easy", restingHeartRateUsed: 46, aerobic: { minutes: 40, speedMps: speed, heartRateBpm: heartRate, speedPerBeat: speed / (heartRate - 46) } },
    ...overrides,
  };
}

describe("computeProgression", () => {
  it("détecte une progression nette d'allure à FC égale", () => {
    const runs = [
      ...[50, 55, 60, 66, 72, 78].map((days, index) => easyRun(days, 400 + (index % 2))),
      ...[3, 9, 15, 21, 28, 35].map((days, index) => easyRun(days, 380 + (index % 2))),
    ];
    const result = computeProgression({ runs, today, reference: { bpm: 135, source: "easy_runs" }, vo2maxSeries: [] });
    expect(result.state).toBe("progressing");
    expect(result.referenceHeartRateBpm).toBe(135);
    expect(result.paceGainSPerKm).toBe(20);
    expect(result.confidence).toBe("high");
  });

  it("reste stable sous le seuil de bruit", () => {
    const runs = [...[50, 60, 70, 80].map((days) => easyRun(days, 400)), ...[5, 15, 25, 35].map((days) => easyRun(days, 398))];
    expect(computeProgression({ runs, today, reference: { bpm: 135, source: "easy_runs" }, vo2maxSeries: [] }).state).toBe("stable");
  });

  it("refuse de conclure avec moins de 3 sorties faciles par période, même sur 8 semaines", () => {
    const runs = [easyRun(70, 400), easyRun(80, 401), easyRun(5, 380), easyRun(12, 381), easyRun(20, 379)];
    const result = computeProgression({ runs, today, reference: { bpm: 135, source: "easy_runs" }, vo2maxSeries: [] });
    expect(result.state).toBe("insufficient");
    expect(result.windowWeeks).toBe(8);
    expect(result.caveats[0]).toContain("au moins 3");
  });

  it("ignore fractionnés, tempos et tapis", () => {
    const noise = [
      easyRun(10, 300, 160, { metrics: { ...easyRun(0, 300).metrics, structure: "intervals" } }),
      easyRun(12, 330, 155, { metrics: { ...easyRun(0, 330).metrics, family: "steady" } }),
      easyRun(14, 330, 135, { sport: "treadmill_running" }),
    ];
    expect(computeProgression({ runs: noise, today, reference: { bpm: 135, source: "easy_runs" }, vo2maxSeries: [] }).points).toHaveLength(0);
  });

  it("suit la VO2max et ne s'appuie jamais sur la température de la montre", () => {
    const runs = [...[50, 55, 60, 66].map((days) => easyRun(days, 380)), ...[3, 9, 15, 21].map((days) => easyRun(days, 395))];
    const result = computeProgression({ runs, today, reference: { bpm: 135, source: "easy_runs" }, vo2maxSeries: [{ date: "2026-09-20", value: 58.4 }, { date: "2026-11-13", value: 58 }] });
    expect(result.vo2max.delta).toBe(-0.4);
    expect(result.caveats.join(" ")).not.toMatch(/°C|chaud/);
    expect(result.runToRunSpreadSPerKm).not.toBeNull();
  });
});

describe("personalReferenceHeartRate", () => {
  const watchZones = { floors: [110, 128, 149, 159, 167] as [number, number, number, number, number], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };
  const historyZones = { floors: [88, 120, 139, 150, 158] as [number, number, number, number, number], maxHeartRateBpm: 176, lactateThresholdHeartRateBpm: null, method: "OBSERVED_MAX_HR" };

  it("zones de la montre : milieu de la zone 2", () => {
    expect(personalReferenceHeartRate({ zones: watchZones, zonesFromWatch: true, easyRunHeartRates: [150, 150, 150] })).toEqual({ bpm: 138, source: "watch_z2" });
  });

  it("sans zones montre mais avec un seuil : ~80 % de la FC seuil", () => {
    expect(personalReferenceHeartRate({ zones: watchZones, zonesFromWatch: false, easyRunHeartRates: [] })).toEqual({ bpm: 135, source: "threshold" });
  });

  it("zones déduites : FC des sorties faciles, ramenée dans la Z2 du profil", () => {
    expect(personalReferenceHeartRate({ zones: historyZones, zonesFromWatch: false, easyRunHeartRates: [128, 131, 133] })).toEqual({ bpm: 131, source: "easy_runs" });
    expect(personalReferenceHeartRate({ zones: historyZones, zonesFromWatch: false, easyRunHeartRates: [150, 152, 155] })).toEqual({ bpm: 138, source: "easy_runs" });
  });

  it("deux profils aux zones différentes n'ont pas la même référence", () => {
    const bastien = personalReferenceHeartRate({ zones: watchZones, zonesFromWatch: true, easyRunHeartRates: [] });
    const older = personalReferenceHeartRate({ zones: historyZones, zonesFromWatch: false, easyRunHeartRates: [] });
    expect(older).toEqual({ bpm: 129, source: "zones_z2" });
    expect(older.bpm).not.toBe(bastien.bpm);
  });

  it("ne retient que les sorties faciles qualifiantes", () => {
    const runs = [easyRun(5, 380, 132), easyRun(12, 380, 136, { sport: "treadmill_running" }), easyRun(200, 380, 140)];
    expect(easyRunHeartRates(runs, today)).toEqual([132]);
  });
});

describe("données rares : règles générales", () => {
  const zones = { floors: [96, 115, 134, 154, 173] as [number, number, number, number, number], maxHeartRateBpm: 192, lactateThresholdHeartRateBpm: null, method: "HR_MAX" };
  it("FC de référence recalée seulement si les footings sont ≥ 5 bpm au-dessus de la Z2 (5 sorties au moins)", async () => {
    const { personalReferenceHeartRate: reference } = await import("./progression");
    expect(reference({ zones, zonesFromWatch: true, easyRunHeartRates: [125, 135, 140, 141, 148, 139, 118] })).toEqual({ bpm: 139, source: "easy_above_z2" });
    // Juste au-dessus de la Z2 (+1 bpm) : inchangé.
    expect(reference({ zones, zonesFromWatch: true, easyRunHeartRates: [134, 134, 135, 133, 134] })).toEqual({ bpm: 124, source: "watch_z2" });
    // Trop peu de sorties : inchangé.
    expect(reference({ zones, zonesFromWatch: true, easyRunHeartRates: [145, 146, 147, 148] })).toEqual({ bpm: 124, source: "watch_z2" });
    // Jamais au-delà du haut de la Z3.
    expect(reference({ zones, zonesFromWatch: true, easyRunHeartRates: [160, 162, 165, 161, 163] }).bpm).toBe(153);
  });

  it("estimation historique : 25 % meilleures sorties sur 12 mois, tirée par chaque sortie récente, confiance selon leur nombre", async () => {
    const { historicalEstimate } = await import("./progression");
    const today = "2026-11-19";
    const old = [2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0, 3.1].map((value, index) => ({ date: `2026-0${(index % 8) + 1}-10`, value, source: "summary" as const }));
    const none = historicalEstimate(old, today, 8);
    expect(none).toMatchObject({ referenceSpeed: 3.0, speedAtReferenceHr: 3.0, recentRuns: 0, confidence: "low" });
    const withRecent = historicalEstimate([...old, { date: "2026-11-10", value: 2.7, source: "streams" }], today, 8);
    // La sortie récente entre aussi dans les 12 mois : référence = 2,9 (25 % meilleures sur 9).
    expect(withRecent?.speedAtReferenceHr).toBeCloseTo((2 * 2.9 + 2.7) / 3, 4);
    expect(withRecent?.confidence).toBe("moderate");
    expect(historicalEstimate(old.slice(0, 4), today, 8)).toBeNull();
  });
});
