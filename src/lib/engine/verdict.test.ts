import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "./activity-metrics";
import { sessionTitle } from "./activity-metrics";
import type { ComparisonDeltas } from "./comparable";
import { classifyVerdict } from "./verdict";

const rep = (speedMps: number) => ({ startOffsetS: 0, durationS: 500, distanceM: 2000, speedMps, heartRateBpm: 168, maxHeartRateBpm: 174, recoveryAfterS: 120 });

const metrics: ActivityMetrics = {
  version: 7, restingHeartRateUsed: 46, kind: "intervals_vo2", family: "intervals", structure: "intervals", mainSpeedMps: 3.5, mainHeartRateBpm: 162, halves: null,
  work: { reps: 3, averageDurationS: 500, averageDistanceM: 2000, averageSpeedMps: 3.997, averageHeartRateBpm: 168.3, peakHeartRateBpm: 174, speedCvPct: 1.5, fadePct: 3, paceSpreadSPerKm: 8, fadeSPerKm: 8, averageRecoveryS: 122, repsDetail: [rep(4.05), rep(4.0), rep(3.92)] },
  aerobic: null, zoneShares: null, elevationGainPerKm: 3.5, averageCadenceSpm: 167, blocks: null, dynamics: null,
};

function deltas(gain: number, count = 3): ComparisonDeltas {
  return { dynamicsReference: null, fadeSPerKm: { current: null, reference: null }, count, current: { speedMps: 3.5, heartRateBpm: 162 }, reference: { speedMps: 3.4, heartRateBpm: 160 }, paceAtEqualHrGainSPerKm: null, hrAtEqualPaceDeltaBpm: null, drift: { current: null, reference: null }, fade: { current: null, reference: null }, work: { current: { speedMps: 3.997, heartRateBpm: 168.3, speedCvPct: 1.5, fadePct: 3 }, reference: { speedMps: 4.13, heartRateBpm: 170.7, speedCvPct: 1.7, fadePct: 2, paceSpreadSPerKm: 7 }, paceAtEqualHrGainSPerKm: gain } };
}

describe("verdict", () => {
  it("place en dessous des repères des répétitions plus lentes à FC égale au-delà du bruit (6 s/km et plus)", () => {
    const verdict = classifyVerdict(metrics, deltas(-6));
    expect(verdict.level).toBe("below");
    expect(verdict.headline).toContain("8 s/km plus lentes, soit 6 s/km plus lentes une fois corrigé de la FC");
    expect(verdict.toWork).toContain("corrigé de la FC");
    // Un seul signal de pacing, jugé par rapport aux comparables (8 s/km contre 7) : dans la norme.
    expect(verdict.signals.filter((signal) => signal.key.startsWith("rep_") && !signal.primary)).toHaveLength(1);
    expect(verdict.signals.find((signal) => signal.key === "rep_pacing")?.tone).toBe("neutral");
  });

  it("13/11 : 4 à 5 s/km corrigés de la FC, c'est du bruit : dans tes repères", () => {
    expect(classifyVerdict(metrics, deltas(-5)).level).toBe("in_line");
    expect(classifyVerdict(metrics, deltas(-4)).level).toBe("in_line");
  });

  it("au-dessus quand le signal principal est bon", () => {
    expect(classifyVerdict(metrics, deltas(6)).level).toBe("above");
  });

  it("signale une comparaison fragile sous 3 séances", () => {
    expect(classifyVerdict(metrics, deltas(0, 2)).fewComparables).toBe(true);
  });

  it("nomme la séance par sa structure", () => {
    expect(sessionTitle(metrics)).toBe("Fractionné long 3 × 2 km");
    expect(sessionTitle({ kind: "intervals_short", work: { ...metrics.work!, averageDurationS: 45, reps: 10, repsDetail: Array.from({ length: 10 }, () => ({ ...rep(5), durationS: 45, distanceM: 220 })) } })).toBe("Fractionné court 10 × 45 s");
    expect(sessionTitle({ kind: "endurance", work: null })).toBe("Endurance");
  });
});

describe("régularité des répétitions", () => {
  it("compare l'écart à l'écart des comparables, sans mélanger avec la perte premières → dernières", () => {
    const label = classifyVerdict(metrics, deltas(-5)).signals.find((signal) => signal.key === "rep_pacing")?.label ?? "";
    expect(label).toBe("8 s/km d'écart entre ta répétition la plus rapide et la plus lente (comparables : 7 s/km d'écart) : dans ta norme.");
  });

  it("répétitions de moins de 60 s : seule la perte en fin de série compte, jugée face à celle des comparables", () => {
    const short: ActivityMetrics = { ...metrics, kind: "intervals_short", work: { ...metrics.work!, averageDurationS: 31, fadeSPerKm: 18, fadePct: 8.2, paceSpreadSPerKm: 26 } };
    const signal = classifyVerdict(short, deltas(0)).signals.find((entry) => entry.key === "rep_pacing");
    expect(signal).toMatchObject({ tone: "watch", label: "Dernières répétitions 18 s/km plus lentes que les premières : plus de perte que sur tes comparables." });
    const calm = classifyVerdict({ ...short, work: { ...short.work!, fadeSPerKm: 7, fadePct: 3 } }, deltas(0)).signals.find((entry) => entry.key === "rep_pacing");
    expect(calm?.label).toBe("Dernières répétitions 7 s/km plus lentes que les premières : dans ta norme.");
  });
});

describe("lecture de la dynamique de course", () => {
  it("explique un pas plus court à cadence égale et repère une foulée stable", async () => {
    const { readDynamics } = await import("./dynamics-reading");
    const values = { cadenceSpm: 171, groundContactMs: 259, verticalOscillationMm: 86, verticalRatioPct: 6, stepLengthM: 1.39 };
    const withDynamics = { ...metrics, dynamics: { ...values, basis: "reps" as const, early: { ...values, cadenceSpm: 172 }, late: { ...values, cadenceSpm: 170 } } };
    const lines = readDynamics(withDynamics, { ...deltas(-4), dynamicsReference: { count: 2, values: { ...values, stepLengthM: 1.46, groundContactMs: 257 } } });
    expect(lines[0]).toContain("pas 7 cm plus court");
    expect(lines.at(-1)).toContain("Foulée stable");
  });
});

describe("sortie facile trop intense", () => {
  const easy = (shares: [number, number, number, number, number]): ActivityMetrics => ({ ...metrics, kind: "endurance", family: "easy", structure: "continuous", work: null, zoneShares: shares });

  it("signale la part du temps au-dessus de la Z2 à partir de 25 %", () => {
    const signal = classifyVerdict(easy([0.11, 0.6, 0.25, 0.04, 0]), deltas(0, 0)).signals.find((entry) => entry.key === "easy_intensity");
    expect(signal).toMatchObject({ tone: "watch", label: "29 % du temps au-dessus de la Z2 : trop intense pour une sortie facile." });
  });

  it("rien sous 25 %, ni pour un fractionné", () => {
    expect(classifyVerdict(easy([0.2, 0.6, 0.15, 0.05, 0]), deltas(0, 0)).signals.some((entry) => entry.key === "easy_intensity")).toBe(false);
    expect(classifyVerdict({ ...metrics, zoneShares: [0, 0.2, 0.3, 0.4, 0.1] }, deltas(0)).signals.some((entry) => entry.key === "easy_intensity")).toBe(false);
  });
});
