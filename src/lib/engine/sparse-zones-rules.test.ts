import { describe, expect, it } from "vitest";
import type { HeartRateZones } from "@/lib/source/types";
import { classifyKind, type ActivityMetrics } from "./activity-metrics";
import type { ComparisonDeltas } from "./comparable";
import { prescribe } from "./prescription";
import { continuousThresholdEvidence, estimateThreshold } from "./threshold";
import { classifyVerdict } from "./verdict";
import { recalibrateEasyZones } from "./zones";

/**
 * Règles déclenchées par les données quand les zones de la montre sont génériques
 * (% de FC max, sans FC seuil) et trop basses pour les footings de la personne.
 * Cas réel : coureur entraîné, footings à 139–148 bpm, Z2 de la montre jusqu'à 133.
 */
const genericZones: HeartRateZones = { floors: [96, 115, 134, 154, 173], maxHeartRateBpm: 192, lactateThresholdHeartRateBpm: null, method: "HR_MAX" };
const easyAverages = [118, 119, 132, 139, 139, 142, 142, 144, 144, 145, 148];

describe("recalibrateEasyZones", () => {
  it("recale la Z2 sur le 9e décile de ses footings + 3 bpm, sans toucher Z4 et Z5", () => {
    const result = recalibrateEasyZones(genericZones, easyAverages);
    expect(result?.zones.floors).toEqual([96, 130, 149, 154, 173]);
    expect(result?.recalibration).toEqual({ easyMedianBpm: 142, watchZ2HighBpm: 133, z2HighBpm: 148, runs: 11 });
  });

  it("ne touche jamais des zones ancrées sur une FC seuil mesurée", () => {
    expect(recalibrateEasyZones({ ...genericZones, lactateThresholdHeartRateBpm: 169 }, easyAverages)).toBeNull();
  });

  it("ne se déclenche pas si les footings restent dans la Z2 (médiane < haut de Z2 + 5) ou s'il y en a moins de 5", () => {
    const custom: HeartRateZones = { floors: [123, 136, 150, 163, 179], maxHeartRateBpm: 192, lactateThresholdHeartRateBpm: null, method: "HR_MAX" };
    expect(recalibrateEasyZones(custom, [129, 134, 141, 145, 148, 148, 148, 150])).toBeNull();
    expect(recalibrateEasyZones(genericZones, [145, 146, 147, 148])).toBeNull();
  });

  it("borne le haut de la Z2 à 5 bpm sous la Z4", () => {
    const result = recalibrateEasyZones(genericZones, [150, 151, 152, 153, 153, 153]);
    expect(result?.zones.floors[2]).toBe(150);
  });
});

describe("classifyKind avec zones recalées", () => {
  const base = { work: null, distanceM: 10_000, zones: genericZones };
  it("90 min et plus : sortie longue, même étiquetée VO2max et menée en Z4", () => {
    expect(classifyKind({ ...base, zoneShares: [0.01, 0.02, 0.02, 0.51, 0.44], movingTimeS: 121 * 60, distanceM: 26_900, trainingEffectLabel: "VO2MAX", zonesRecalibrated: true })).toBe("long");
    // Sans recalage : comportement historique inchangé.
    expect(classifyKind({ ...base, zoneShares: [0.01, 0.02, 0.02, 0.51, 0.44], movingTimeS: 121 * 60, distanceM: 26_900, trainingEffectLabel: "VO2MAX" })).toBe("threshold");
  });

  it("étiquette TEMPO sur une séance surtout en Z1–Z2 : endurance", () => {
    expect(classifyKind({ ...base, zoneShares: [0.03, 0.62, 0.35, 0, 0], movingTimeS: 49 * 60, trainingEffectLabel: "TEMPO", zonesRecalibrated: true })).toBe("endurance");
    expect(classifyKind({ ...base, zoneShares: [0.03, 0.62, 0.35, 0, 0], movingTimeS: 49 * 60, trainingEffectLabel: "TEMPO" })).toBe("tempo");
  });

  it("étiquette seuil sans temps en Z4 : pas un seuil", () => {
    expect(classifyKind({ ...base, zoneShares: [0.1, 0.5, 0.35, 0.05, 0], movingTimeS: 50 * 60, trainingEffectLabel: "LACTATE_THRESHOLD", zonesRecalibrated: true })).not.toBe("threshold");
  });
});

const recalibrated: HeartRateZones = { ...genericZones, floors: [96, 130, 149, 154, 173] };

function longMetrics(mainHr: number, fadeSPerKm: number): ActivityMetrics {
  return {
    version: 13, restingHeartRateUsed: 42, kind: "long", family: "long", structure: "continuous", mainSpeedMps: 3.676, mainHeartRateBpm: mainHr,
    halves: { first: { speedMps: 3.62, heartRateBpm: mainHr - 2 }, second: { speedMps: 3.74, heartRateBpm: mainHr + 2 }, fadePct: -3, driftPct: -0.3, fadeSPerKm },
    work: null, aerobic: null, zoneShares: [0.01, 0.02, 0.02, 0.51, 0.44], elevationGainPerKm: 22, averageCadenceSpm: 168, blocks: null, dynamics: null,
  };
}

describe("prescription d'une sortie longue menée en Z4", () => {
  it("ni reproche d'intensité ni « même effort plus long » : récupération", () => {
    const result = prescribe({ metrics: longMetrics(171, -9), zones: recalibrated, lactateThresholdSpeedMps: null, thresholdLabel: "seuil observé", restingHeartRateBpm: 42, recentSpeedPerBeat: 0.03, movingTimeS: 121 * 60, raceTargets: [], efforts: [], reference: null, context: null });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.shouldHave).toEqual([]);
    expect(result.keep).toContain("Effort long soutenu");
    expect(result.next.cue).toContain("footing facile entre 130 et 148 bpm");
  });

  it("sortie longue en Z2 : consigne d'endurance habituelle", () => {
    const result = prescribe({ metrics: longMetrics(140, 2), zones: recalibrated, lactateThresholdSpeedMps: null, thresholdLabel: "seuil observé", restingHeartRateBpm: 42, recentSpeedPerBeat: 0.03, movingTimeS: 100 * 60, raceTargets: [], efforts: [], reference: null, context: null });
    if (result.status !== "ok") throw new Error("consigne attendue");
    expect(result.next.cue).toContain("Sortie longue");
  });
});

const easy: ActivityMetrics = {
  version: 13, restingHeartRateUsed: 42, kind: "endurance", family: "easy", structure: "continuous", mainSpeedMps: 3.1, mainHeartRateBpm: 141, halves: null,
  work: null, aerobic: null, zoneShares: null, elevationGainPerKm: 7, averageCadenceSpm: 164, blocks: null, dynamics: null,
};

function easyDeltas(gain: number, noise: ComparisonDeltas["noise"]): ComparisonDeltas {
  return { dynamicsReference: null, count: 5, current: { speedMps: 3.1, heartRateBpm: 141 }, reference: { speedMps: 3.1, heartRateBpm: 140 }, paceAtEqualHrGainSPerKm: gain, hrAtEqualPaceDeltaBpm: null, noise, drift: { current: null, reference: null }, fade: { current: null, reference: null }, fadeSPerKm: { current: null, reference: null }, work: null };
}

describe("verdict : bruit des comparables et dénivelé", () => {
  it("un écart inférieur à la moitié de la dispersion des comparables reste du bruit", () => {
    expect(classifyVerdict(easy, easyDeltas(-7, { spreadSPerKm: 21, climbGapMPerKm: 0 })).level).toBe("in_line");
    expect(classifyVerdict(easy, easyDeltas(-12, { spreadSPerKm: 21, climbGapMPerKm: 0 })).level).toBe("below");
  });

  it("comparables homogènes : le seuil de 6 s/km s'applique", () => {
    expect(classifyVerdict(easy, easyDeltas(-7, { spreadSPerKm: 6, climbGapMPerKm: 0 })).level).toBe("below");
  });

  it("nettement plus vallonnée que les comparables : écart non concluant", () => {
    const verdict = classifyVerdict(easy, easyDeltas(-37, { spreadSPerKm: 10, climbGapMPerKm: 22 }));
    expect(verdict.level).not.toBe("below");
    expect(verdict.signals.find((signal) => signal.key === "efficiency")?.label).toContain("non concluant");
  });
});

describe("seuil observé sur un effort continu", () => {
  const steady = (localDate: string, hr: number, speedMps: number, movingTimeS: number, climb = 5): { localDate: string; metrics: ActivityMetrics; movingTimeS: number } => ({
    localDate, movingTimeS, metrics: { ...easy, kind: "threshold", family: "steady", mainHeartRateBpm: hr, mainSpeedMps: speedMps, elevationGainPerKm: climb },
  });

  it("retenu seulement sans seuil montre ni répétitions, dans la moitié haute de la bande Z4, 20 min au moins, terrain roulant", () => {
    const runs = [steady("2026-11-02", 170, 3.8, 52 * 60), steady("2026-09-26", 155, 3.37, 71 * 60), steady("2026-10-24", 171, 3.7, 121 * 60, 22), steady("2026-11-10", 168, 3.9, 20 * 60)];
    const evidence = continuousThresholdEvidence(runs, "2026-11-20", { low: 154, high: 172, fromZones: true });
    expect(evidence.map((entry) => entry.localDate)).toEqual(["2026-11-02"]);
    const estimate = estimateThreshold({ runs, today: "2026-11-20", watchSpeedMps: null, thresholdHeartRateBpm: null, zoneFloors: [96, 130, 149, 154, 173] });
    expect(estimate.source).toBe("observed");
    expect(estimate.basis).toContain("continu de 47 min");
    // Un seuil de montre connu reste prioritaire.
    expect(estimateThreshold({ runs, today: "2026-11-20", watchSpeedMps: 3.7, thresholdHeartRateBpm: null, zoneFloors: [96, 130, 149, 154, 173] }).evidence).toEqual([]);
  });
});
