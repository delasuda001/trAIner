import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { computeProgression, type ProgressionRun } from "./progression";

const today = "2026-11-15";

function easyRun(daysAgo: number, paceSecPerKm: number, heartRate = 135, overrides: Partial<ProgressionRun> = {}): ProgressionRun {
  const speed = 1000 / paceSecPerKm;
  return {
    id: `r${daysAgo}`,
    localDate: addDays(today, -daysAgo),
    distanceM: 10000,
    averageTemperatureC: 20,
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
    const result = computeProgression({ runs, today, fallbackReferenceHeartRateBpm: 140, vo2maxSeries: [] });
    expect(result.state).toBe("progressing");
    expect(result.referenceHeartRateBpm).toBe(135);
    expect(result.paceGainSPerKm).toBe(20);
    expect(result.confidence).toBe("high");
  });

  it("reste stable sous le seuil de bruit", () => {
    const runs = [...[50, 60, 70, 80].map((days) => easyRun(days, 400)), ...[5, 15, 25, 35].map((days) => easyRun(days, 398))];
    expect(computeProgression({ runs, today, fallbackReferenceHeartRateBpm: 140, vo2maxSeries: [] }).state).toBe("stable");
  });

  it("refuse de conclure avec moins de 3 sorties faciles par période, même sur 8 semaines", () => {
    const runs = [easyRun(70, 400), easyRun(80, 401), easyRun(5, 380), easyRun(12, 381), easyRun(20, 379)];
    const result = computeProgression({ runs, today, fallbackReferenceHeartRateBpm: 140, vo2maxSeries: [] });
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
    expect(computeProgression({ runs: noise, today, fallbackReferenceHeartRateBpm: 140, vo2maxSeries: [] }).points).toHaveLength(0);
  });

  it("signale l'effet de la chaleur et suit la VO2max", () => {
    const runs = [
      ...[50, 55, 60, 66].map((days) => easyRun(days, 380, 135, { averageTemperatureC: 29 })),
      ...[3, 9, 15, 21].map((days) => easyRun(days, 395, 135, { averageTemperatureC: 18 })),
    ];
    const result = computeProgression({ runs, today, fallbackReferenceHeartRateBpm: 140, vo2maxSeries: [{ date: "2026-09-20", value: 58.4 }, { date: "2026-11-13", value: 58 }] });
    expect(result.caveats.join(" ")).toContain("plus chaude");
    expect(result.vo2max.delta).toBe(-0.4);
  });
});
