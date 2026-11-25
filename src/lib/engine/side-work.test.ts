import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "./activity-metrics";
import { sideWork } from "./side-work";

const values = (cadenceSpm: number, groundContactMs: number) => ({ cadenceSpm, groundContactMs, verticalOscillationMm: 90, verticalRatioPct: 8, stepLengthM: 1.2 });

function metrics(overrides: Partial<ActivityMetrics>): ActivityMetrics {
  return { version: 14, restingHeartRateUsed: 46, kind: "intervals_threshold", family: "intervals", structure: "intervals", mainSpeedMps: 4, mainHeartRateBpm: 165, halves: null, work: null, aerobic: null, zoneShares: null, elevationGainPerKm: 3, averageCadenceSpm: 175, blocks: null, dynamics: null, ...overrides } as ActivityMetrics;
}

describe("pistes à côté de la séance", () => {
  it("foulée qui se dégrade en fin d'effort : renforcement, gammes et lignes droites, cadence", () => {
    const items = sideWork({ metrics: metrics({ dynamics: { ...values(176, 240), basis: "reps", early: values(178, 232), late: values(173, 245) } as ActivityMetrics["dynamics"] }) });
    expect(items.map((item) => item.topic)).toEqual(["strength", "drills", "cadence"]);
    expect(items[0].text).toContain("2 séances de 15 à 20 min par semaine");
  });

  it("foulée stable et pas de baisse de fin : aucune piste, sauf un levier de volume", () => {
    const stable = metrics({ dynamics: { ...values(176, 240), basis: "reps", early: values(176, 238), late: values(175, 241) } as ActivityMetrics["dynamics"] });
    expect(sideWork({ metrics: stable })).toEqual([]);
    expect(sideWork({ metrics: stable, goalLever: "volume" }).map((item) => item.topic)).toEqual(["volume"]);
  });
});
