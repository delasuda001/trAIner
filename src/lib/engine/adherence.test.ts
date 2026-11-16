import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "./activity-metrics";
import { compareToAdvice } from "./adherence";

const easy: ActivityMetrics = { version: 10, restingHeartRateUsed: 46, kind: "endurance", family: "easy", structure: "continuous", mainSpeedMps: 1000 / 380, mainHeartRateBpm: 152, halves: null, work: null, aerobic: null, zoneShares: null, elevationGainPerKm: null, averageCadenceSpm: null, blocks: null, dynamics: null };

describe("respect d'un conseil", () => {
  it("endurance conseillée, faite au bon type mais trop haute en FC", () => {
    const result = compareToAdvice(easy, ["easy"], { paceFastS: 356, paceSlowS: 379, heartRateLow: 128, heartRateHigh: 148 });
    expect(result).toMatchObject({ typeMatch: true, followed: false, pace: "6:20/km, 1 s/km plus lent que la cible 5:56–6:19/km (dans la tolérance)" });
    expect(result.heartRate).toBe("152 bpm, 4 bpm au-dessus de la cible 128–148 bpm");
  });

  it("fractionné fait à la place d'une endurance", () => {
    expect(compareToAdvice({ ...easy, family: "intervals", kind: "intervals_vo2" }, ["easy"], null)).toMatchObject({ typeMatch: false, followed: false });
  });
});
