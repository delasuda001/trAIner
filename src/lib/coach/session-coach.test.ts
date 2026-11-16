import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "@/lib/engine/activity-metrics";
import type { ComparisonDeltas } from "@/lib/engine/comparable";
import { classifyVerdict } from "@/lib/engine/verdict";
import type { HeartRateZones } from "@/lib/source/types";
import { allowedNumbers, findUnsupportedNumbers } from "./number-guard";
import { buildSessionPayload, buildSessionPrompt, SESSION_SYSTEM_PROMPT } from "./session-coach";

const zones: HeartRateZones = { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };
const session = { name: "Toronto", localDate: "2026-11-13", sport: "running", distanceM: 10137, movingTimeS: 2865, averageSpeedMps: 3.539, averageHeartRateBpm: 160, elevationGainM: 35, averageCadenceSpm: 166.8, averageTemperatureC: 17 };

function intervalMetrics(reps: number): ActivityMetrics {
  const rep = { startOffsetS: 600, durationS: 120, distanceM: 520, speedMps: 4.3, heartRateBpm: 170, maxHeartRateBpm: 176, recoveryAfterS: 90 };
  return {
    version: 6, restingHeartRateUsed: 46, kind: "intervals_vo2", family: "intervals", structure: "intervals", mainSpeedMps: 3.5, mainHeartRateBpm: 160, halves: null,
    work: { reps, averageDurationS: 120, averageDistanceM: 520, averageSpeedMps: 4.3, averageHeartRateBpm: 170, peakHeartRateBpm: 176, speedCvPct: 2.1, fadePct: 1.4, averageRecoveryS: 90, repsDetail: Array.from({ length: reps }, () => rep) },
    aerobic: null, zoneShares: [0.05, 0.1, 0.2, 0.25, 0.4], elevationGainPerKm: 3.5, averageCadenceSpm: 167, blocks: null,
  };
}

const deltas: ComparisonDeltas = {
  count: 5, current: { speedMps: 3.5, heartRateBpm: 160 }, reference: { speedMps: 3.4, heartRateBpm: 158 }, paceAtEqualHrGainSPerKm: null, hrAtEqualPaceDeltaBpm: null,
  drift: { current: null, reference: null }, fade: { current: null, reference: null },
  work: { current: { speedMps: 4.3, heartRateBpm: 170, speedCvPct: 2.1, fadePct: 1.4 }, reference: { speedMps: 4.25, heartRateBpm: 171, speedCvPct: 3, fadePct: 2 }, paceAtEqualHrGainSPerKm: 2 },
};

const comparables = Array.from({ length: 5 }, (_, index) => ({ localDate: `2026-10-0${index + 1}`, title: "Fractionné 6 × 500 m", ageDays: 40 + index, movingTimeS: 2800, distanceM: 9000, mainSpeedMps: 3.4, mainHeartRateBpm: 158, workSpeedMps: 4.25, workHeartRateBpm: 171 }));
const context = { loadRatio: 1.4, acute7d: 326, chronicWeekly28d: 234, qualityBefore14d: [{ localDate: "2026-11-04", title: "Fractionné 5 × 1 km", daysBefore: 9 }], daysSincePreviousRun: 3, recovery: { hrv: { latest: 60, baselineLow: 52, baselineHigh: 73 }, restingHr: { latest: 46, delta: -1 }, sleep: { latest: 29000, delta: 600 }, flags: [] } };

function payloadFor(reps: number) {
  const metrics = intervalMetrics(reps);
  return buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: { objectif: "10 km", temps_vise: "43:00" } });
}

describe("charge utile du débrief", () => {
  it("reste sous ~2 000 tokens même pour 20 répétitions (≈ 3,2 caractères par token en français)", () => {
    const size = buildSessionPrompt(payloadFor(20)).length + SESSION_SYSTEM_PROMPT.length;
    expect(size / 3.2).toBeLessThan(2000);
  });

  it("détaille au plus 10 répétitions", () => {
    expect(payloadFor(20).structure).toMatchObject({ detail_repetitions: expect.any(Array) });
    expect((payloadFor(20).structure as { detail_repetitions: string[] }).detail_repetitions).toHaveLength(10);
  });

  it("ne contient aucune série brute ni coordonnée", () => {
    const text = JSON.stringify(payloadFor(6));
    expect(text).not.toMatch(/latitude|longitude|timeS|speedMps/i);
  });

  it("un texte qui reprend les chiffres de la charge utile passe le garde-fou", () => {
    const allowed = allowedNumbers(payloadFor(6));
    expect(findUnsupportedNumbers("6 répétitions à 3:53/km pour 170 bpm, contre 3:55/km sur tes 5 fractionnés comparables, charge 1,4 fois la moyenne.", allowed)).toEqual([]);
  });

  it("annote chaque FC de sa zone", () => {
    expect(JSON.stringify(payloadFor(6))).toContain("170 bpm (Z5)");
  });
});
