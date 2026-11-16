import { describe, expect, it } from "vitest";
import type { ActivityStreams, HeartRateZones, Lap } from "@/lib/source/types";
import { classifyKind, computeActivityMetrics, detectWorkBlock } from "./activity-metrics";

const zones: HeartRateZones = { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };

function lap(index: number, durationS: number, paceMinPerKm: number, heartRate: number): Lap {
  const speed = 1000 / (paceMinPerKm * 60);
  return { index, startOffsetS: 0, durationS, distanceM: speed * durationS, averageSpeedMps: speed, averageHeartRateBpm: heartRate, maxHeartRateBpm: heartRate + 5, averageCadenceSpm: 170, elevationGainM: 2, trigger: "manual" };
}

function steadyStreams(durationS: number, speed: (t: number) => number, heartRate: (t: number) => number): ActivityStreams {
  const streams: ActivityStreams = { timeS: [], distanceM: [], speedMps: [], heartRateBpm: [], cadenceSpm: [], altitudeM: [] };
  let distance = 0;
  for (let t = 0; t <= durationS; t += 1) {
    distance += speed(t);
    streams.timeS.push(t);
    streams.distanceM.push(distance);
    streams.speedMps.push(speed(t));
    streams.heartRateBpm.push(heartRate(t));
    streams.cadenceSpm.push(166);
    streams.altitudeM.push(80);
  }
  return streams;
}

describe("detectWorkBlock", () => {
  it("isole 3 × 2 km d'un échauffement un peu appuyé (séance réelle du 13/11)", () => {
    const laps = [lap(0, 429, 5.03, 136), lap(1, 494, 4.12, 165), lap(2, 121, 6.26, 154), lap(3, 498, 4.15, 169), lap(4, 123, 6.01, 159), lap(5, 510, 4.24, 171), lap(6, 690, 5.61, 156)];
    const work = detectWorkBlock(laps);
    expect(work?.reps).toBe(3);
    expect(work?.fadePct).toBeGreaterThan(2);
    expect(work?.averageRecoveryS).toBe(122);
  });

  it("ne prend pas quelques accélérations en fin de footing pour un fractionné", () => {
    const laps = [lap(0, 3191, 6.75, 128), lap(1, 81, 3.87, 152), lap(2, 43, 8.13, 154), lap(3, 64, 3.52, 145), lap(4, 109, 6.14, 149), lap(5, 62, 3.8, 153), lap(6, 98, 6.29, 151), lap(7, 39, 3.41, 157)];
    expect(detectWorkBlock(laps)).toBeNull();
  });

  it("ignore des laps automatiques au kilomètre d'une sortie régulière", () => {
    const laps = Array.from({ length: 10 }, (_, index) => lap(index, 360 + (index % 2) * 8, 6 + (index % 3) * 0.08, 135));
    expect(detectWorkBlock(laps)).toBeNull();
  });
});

describe("classifyKind", () => {
  it("suit le bénéfice « endurance » de la montre même avec une FC en Z3", () => {
    expect(classifyKind({ work: null, zoneShares: [0.05, 0.3, 0.55, 0.1, 0], movingTimeS: 3700, distanceM: 9500, zones, trainingEffectLabel: "AEROBIC_BASE" })).toBe("endurance");
  });
  it("classe une longue sortie facile en sortie longue", () => {
    expect(classifyKind({ work: null, zoneShares: [0.1, 0.8, 0.1, 0, 0], movingTimeS: 85 * 60, distanceM: 13300, zones, trainingEffectLabel: "AEROBIC_BASE" })).toBe("long");
  });
  it("classe un continu majoritairement en Z4–Z5 au seuil", () => {
    expect(classifyKind({ work: null, zoneShares: [0, 0.1, 0.2, 0.5, 0.2], movingTimeS: 1800, distanceM: 6600, zones, trainingEffectLabel: null })).toBe("threshold");
  });
});

describe("computeActivityMetrics", () => {
  it("mesure ralentissement, dérive cardiaque et efficacité aérobie sur une sortie continue", () => {
    const streams = steadyStreams(3600, (t) => (t < 1800 ? 2.8 : 2.7), (t) => (t < 1800 ? 135 : 140));
    const metrics = computeActivityMetrics({ streams, laps: [], zones, restingHeartRateBpm: 46, movingTimeS: 3600, distanceM: 9900, elevationGainM: 10, averageSpeedMps: 2.75, averageHeartRateBpm: 137, averageCadenceSpm: 166, hrTimeInZonesS: null, trainingEffectLabel: "AEROBIC_BASE" });
    expect(metrics.structure).toBe("continuous");
    expect(metrics.halves?.fadePct).toBeGreaterThan(2);
    expect(metrics.halves?.driftPct).toBeGreaterThan(3);
    expect(metrics.aerobic?.minutes).toBeGreaterThan(40);
    expect(metrics.aerobic?.speedPerBeat).toBeCloseTo(2.75 / (137.5 - 46), 2);
  });

  it("accepte l'enregistrement intelligent (un point toutes les 5 s)", () => {
    const dense = steadyStreams(3600, () => 2.8, () => 135);
    const sparse: ActivityStreams = { timeS: [], distanceM: [], speedMps: [], heartRateBpm: [], cadenceSpm: [], altitudeM: [] };
    dense.timeS.forEach((_, index) => {
      if (index % 5) return;
      (Object.keys(sparse) as Array<keyof ActivityStreams>).forEach((key) => (sparse[key] as Array<number | null>).push(dense[key][index]));
    });
    const metrics = computeActivityMetrics({ streams: sparse, laps: [], zones, restingHeartRateBpm: 46, movingTimeS: 3600, distanceM: 10000, elevationGainM: 0, averageSpeedMps: 2.8, averageHeartRateBpm: 135, averageCadenceSpm: 166, hrTimeInZonesS: null, trainingEffectLabel: null });
    expect(metrics.aerobic).not.toBeNull();
  });
});
