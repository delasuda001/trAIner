import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "./activity-metrics";
import { computeDeltas, selectComparables, type RunForComparison } from "./comparable";

function metrics(overrides: Partial<ActivityMetrics> = {}): ActivityMetrics {
  return { version: 5, restingHeartRateUsed: 46, kind: "endurance", family: "easy", structure: "continuous", mainSpeedMps: 2.6, mainHeartRateBpm: 132, halves: { first: { speedMps: 2.6, heartRateBpm: 130 }, second: { speedMps: 2.6, heartRateBpm: 134 }, fadePct: 0, driftPct: 3, fadeSPerKm: 0 }, work: null, aerobic: null, zoneShares: null, elevationGainPerKm: 5, averageCadenceSpm: 166, blocks: null, dynamics: null, ...overrides };
}

function run(id: string, date: string, overrides: Partial<RunForComparison> = {}, metricOverrides: Partial<ActivityMetrics> = {}): RunForComparison {
  return { id, startTimeUtc: `${date}T12:00:00Z`, localDate: date, name: id, sport: "running", movingTimeS: 3600, distanceM: 9500, averageTemperatureC: 20, metrics: metrics(metricOverrides), ...overrides };
}

describe("selectComparables", () => {
  const current = run("now", "2026-11-07");

  it("ne compare jamais une sortie facile à un fractionné et ignore les séances futures", () => {
    const history = [
      run("easy-1", "2026-10-24"),
      run("intervals", "2026-10-30", {}, { family: "intervals", kind: "intervals_vo2", structure: "intervals" }),
      run("future", "2026-11-10"),
    ];
    expect(selectComparables(current, history).map((match) => match.id)).toEqual(["easy-1"]);
  });

  it("classe d'abord les séances de durée, distance et dénivelé proches, au plus 5", () => {
    const history = [
      run("hilly", "2026-10-20", {}, { elevationGainPerKm: 30 }),
      run("short", "2026-10-21", { movingTimeS: 1500, distanceM: 4000 }),
      run("twin", "2026-10-22"),
      ...Array.from({ length: 6 }, (_, index) => run(`other-${index}`, `2026-09-0${index + 1}`, { movingTimeS: 3300 + index * 60 })),
    ];
    const matches = selectComparables(current, history);
    expect(matches[0].id).toBe("twin");
    expect(matches).toHaveLength(5);
    expect(matches.map((match) => match.id)).not.toContain("short");
  });

  it("accepte une sortie longue en repli pour une sortie facile, avec pénalité", () => {
    const longRun = run("long", "2026-10-15", { movingTimeS: 4500 }, { family: "long", kind: "long" });
    const matches = selectComparables(current, [longRun]);
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBeGreaterThan(0.6);
  });
});

describe("comparables par paliers (format, puis famille, puis jusqu'à 2 ans)", () => {
  function work(reps: number, durationS: number, recoveryS: number, speedMps: number, heartRate: number): NonNullable<ActivityMetrics["work"]> {
    return { reps, averageDurationS: durationS, averageDistanceM: Math.round(speedMps * durationS), averageSpeedMps: speedMps, averageHeartRateBpm: heartRate, peakHeartRateBpm: heartRate + 5, speedCvPct: 3, fadePct: 2, paceSpreadSPerKm: 20, fadeSPerKm: 6, averageRecoveryS: recoveryS, repsDetail: [] };
  }
  const interval = (id: string, date: string, w: NonNullable<ActivityMetrics["work"]>, kind: ActivityMetrics["kind"] = "intervals_short") =>
    run(id, date, { movingTimeS: 2100, distanceM: 6200 }, { structure: "intervals", family: "intervals", kind, work: w });
  const today = interval("now", "2026-11-17", work(14, 31, 31, 4.68, 165));

  it("sans autre 30/30 récent, retient un fractionné court d'un autre format (même famille), jamais un fractionné long", () => {
    const history = [
      interval("short-60", "2026-07-13", work(7, 60, 90, 4.6, 162)),
      interval("long-103", "2026-02-23", work(6, 103, 94, 4.3, 168), "intervals_vo2"),
    ];
    const matches = selectComparables(today, history);
    expect(matches.map((match) => [match.id, match.nature])).toEqual([["short-60", "family"]]);
  });

  it("le même format passe d'abord ; un 30/30 de plus d'un an est accepté en dernier recours, signalé", () => {
    const history = [
      interval("short-60", "2026-07-13", work(7, 60, 90, 4.6, 162)),
      interval("old-30-30", "2025-09-16", work(10, 31, 30, 4.6, 163)),
    ];
    const matches = selectComparables(today, history);
    expect(matches.map((match) => match.id)).toEqual(["short-60", "old-30-30"]);
    expect(matches[1]).toMatchObject({ nature: "format", older: true });
  });

  it("face à un format différent, compare l'allure moyenne et la FC, pas la régularité", () => {
    const family = { ...interval("short-60", "2026-07-13", work(7, 60, 90, 4.6, 162)), nature: "family" as const };
    const deltas = computeDeltas(today, [family]);
    expect(deltas.work?.reference?.speedMps).toBeCloseTo(4.6);
    expect(deltas.work?.reference?.heartRateBpm).toBe(162);
    expect(deltas.work?.reference?.paceSpreadSPerKm).toBeNull();
    expect(deltas.work?.reference?.fadePct).toBeNull();
  });
});

describe("computeDeltas", () => {
  it("chiffre le gain d'allure à FC égale et l'écart de FC à allure égale", () => {
    const current = run("now", "2026-11-07", {}, { mainSpeedMps: 2.7, mainHeartRateBpm: 132 });
    const deltas = computeDeltas(current, [run("a", "2026-10-01"), run("b", "2026-10-10")]);
    // Comparables : 2,6 m/s à 132 bpm → à 132 bpm on court maintenant 2,7 m/s.
    expect(deltas.paceAtEqualHrGainSPerKm).toBe(Math.round(1000 / 2.6 - 1000 / 2.7));
    expect(deltas.hrAtEqualPaceDeltaBpm).toBeLessThan(0);
    expect(deltas.count).toBe(2);
  });

  it("ne calcule pas d'écart « à FC égale » sur un fractionné", () => {
    const current = run("now", "2026-11-07", {}, { structure: "intervals", family: "intervals", kind: "intervals_vo2" });
    expect(computeDeltas(current, [run("a", "2026-10-01")]).paceAtEqualHrGainSPerKm).toBeNull();
  });
});
