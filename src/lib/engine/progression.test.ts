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
