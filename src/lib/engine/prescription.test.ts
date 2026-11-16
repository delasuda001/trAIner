import { describe, expect, it } from "vitest";
import type { HeartRateZones } from "@/lib/source/types";
import type { ActivityMetrics } from "./activity-metrics";
import { goalMarker, goalSentence, prescribe, type PrescriptionInput } from "./prescription";

const zones: HeartRateZones = { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };
const LT = 3.833; // 4:21/km
const targets = [{ distanceKm: 5, targetTimeS: 19 * 60 }, { distanceKm: 21.0975, targetTimeS: 87 * 60 }];

const rep = (speedMps: number, recoveryAfterS = 122) => ({ startOffsetS: 0, durationS: 500, distanceM: 2000, speedMps, heartRateBpm: 168, maxHeartRateBpm: 174, recoveryAfterS });

const base: ActivityMetrics = {
  version: 10, restingHeartRateUsed: 46, kind: "intervals_vo2", family: "intervals", structure: "intervals", mainSpeedMps: 3.565, mainHeartRateBpm: 162.8, halves: null,
  work: { reps: 3, averageDurationS: 501, averageDistanceM: 2000, averageSpeedMps: 3.997, averageHeartRateBpm: 168.3, peakHeartRateBpm: 174, speedCvPct: 1.5, fadePct: 3, paceSpreadSPerKm: 8, fadeSPerKm: 8, averageRecoveryS: 122, repsDetail: [rep(1000 / 247), rep(1000 / 249), rep(1000 / 255)] },
  aerobic: null, zoneShares: null, elevationGainPerKm: 3.5, averageCadenceSpm: 171, blocks: null, dynamics: null,
};

function input(metrics: ActivityMetrics, overrides: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return { metrics, zones, lactateThresholdSpeedMps: LT, restingHeartRateBpm: 46, recentSpeedPerBeat: 0.03, movingTimeS: 2858, raceTargets: targets, context: { loadRatio: 1.6, qualityBefore: [{ title: "Fractionné court 8 × 70 s", daysBefore: 3 }] }, ...overrides };
}

describe("goalMarker", () => {
  it("juge le 5 km en 19:00 hors de portée avec un seuil à 4:21/km et donne la cible réaliste", () => {
    const marker = goalMarker(LT, targets, 5);
    expect(marker).toMatchObject({ race: "5 km", goalPaceS: 228, realisticPaceS: 246, status: "out_of_reach" });
    expect(goalSentence(marker as NonNullable<typeof marker>)).toContain("Cible réaliste du moment : 4:06/km");
  });

  it("juge un objectif proche de l'allure réaliste à portée", () => {
    expect(goalMarker(LT, [{ distanceKm: 5, targetTimeS: 1230 }], 5)?.status).toBe("reachable");
  });
});

describe("prescribe", () => {
  it("fractionné 3 × 2 km du 13/11 : récupération trop courte, charge élevée, même format la prochaine fois", () => {
    const result = prescribe(input(base));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.target).toMatchObject({ label: "allure 5 km réaliste", paceFastS: 243, paceSlowS: 249, zone: "Z5" });
    expect(result.shouldHave[0]).toContain("Récupération : 2:02");
    expect(result.shouldHave[0]).toContain("3:00 conseillées");
    expect(result.shouldHave.some((line) => line.startsWith("Placement : charge 7 jours à 1,6"))).toBe(true);
    expect(result.next.cue).toBe("Même format 3 × 2 km à 4:03–4:09/km, récupération 3:00 ; 1re répétition à 4:09/km, pas plus vite.");
    expect(result.goal?.status).toBe("out_of_reach");
  });

  it("départ trop rapide quand la 1re répétition est sous la fourchette", () => {
    const metrics = { ...base, work: { ...(base.work as NonNullable<ActivityMetrics["work"]>), averageRecoveryS: 180, repsDetail: [rep(1000 / 238, 180), rep(1000 / 246, 180), rep(1000 / 252, 180)] } };
    const result = prescribe(input(metrics, { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave[0]).toContain("Départ trop rapide : 1re répétition à 3:58/km");
  });

  it("séance dans la cible et régulière : une répétition de plus", () => {
    const metrics = { ...base, work: { ...(base.work as NonNullable<ActivityMetrics["work"]>), averageSpeedMps: 1000 / 246, fadeSPerKm: 1, averageRecoveryS: 180, repsDetail: [rep(1000 / 246, 180), rep(1000 / 246, 180), rep(1000 / 247, 180)] } };
    const result = prescribe(input(metrics, { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave).toEqual([]);
    expect(result.keep).toContain("à reproduire");
    expect(result.next.format).toBe("4 × 2 km");
  });

  it("endurance trop haute en FC : cible Z2 et allure traduite", () => {
    const metrics: ActivityMetrics = { ...base, kind: "endurance", family: "easy", structure: "continuous", work: null, mainSpeedMps: 2.62, mainHeartRateBpm: 147.7, halves: { first: { speedMps: 2.62, heartRateBpm: 144 }, second: { speedMps: 2.62, heartRateBpm: 151 }, fadePct: 0, driftPct: 5.1, fadeSPerKm: -1 } };
    const result = prescribe(input(metrics));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.target).toMatchObject({ zone: "Z2", heartRateLow: 128, heartRateHigh: 148 });
    expect(result.shouldHave.some((line) => line.startsWith("Départ : dérive cardiaque de 5,1 %"))).toBe(true);
    expect(result.next.cue).toContain("entre 128 et 148 bpm");
  });

  it("pas de consigne quand les répétitions ne sont pas reconnues", () => {
    expect(prescribe(input({ ...base, work: null })).status).toBe("none");
  });
});

describe("prescribe, séances mal reconnues", () => {
  it("pas de consigne pour un « tempo » couru 40 s/km sous la cible", () => {
    const metrics: ActivityMetrics = { ...base, kind: "tempo", family: "steady", structure: "continuous", work: null, mainSpeedMps: 1000 / 314, mainHeartRateBpm: 156, halves: { first: { speedMps: 1000 / 302, heartRateBpm: 152 }, second: { speedMps: 1000 / 327, heartRateBpm: 160 }, fadePct: 8, driftPct: 10, fadeSPerKm: 25 } };
    expect(prescribe(input(metrics))).toMatchObject({ status: "none" });
  });

  it("format court en secondes : 8 × 70 s", () => {
    const short = (speed: number) => ({ ...rep(speed, 60), durationS: 70, distanceM: 312 });
    const metrics: ActivityMetrics = { ...base, kind: "intervals_short", work: { ...(base.work as NonNullable<ActivityMetrics["work"]>), reps: 8, averageDurationS: 70, averageDistanceM: 312, averageSpeedMps: 4.447, fadeSPerKm: -3, averageRecoveryS: 60, repsDetail: Array.from({ length: 8 }, () => short(4.447)) } };
    const result = prescribe(input(metrics, { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.next.format).toBe("9 × 70 s");
  });
});

describe("prescribe, répétitions trop rapides (4/11)", () => {
  it("4:00/km pour une cible 4:03–4:09/km : le dit, et ne propose pas d'en ajouter", () => {
    const metrics = { ...base, work: { ...(base.work as NonNullable<ActivityMetrics["work"]>), averageSpeedMps: 1000 / 240, fadeSPerKm: -6, averageRecoveryS: 184, repsDetail: [rep(1000 / 243, 184), rep(1000 / 241, 184), rep(1000 / 237, 184)] } };
    const result = prescribe(input(metrics, { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave[0]).toContain("plus rapides que la cible 4:03–4:09/km");
    expect(result.next.format).toBe("3 × 2 km");
  });
});
