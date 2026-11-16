import { describe, expect, it } from "vitest";
import type { HeartRateZones } from "@/lib/source/types";
import type { ActivityMetrics } from "./activity-metrics";
import type { LoadAlert } from "./load";
import { goalMarker, goalStatus, paceReferenceSentence, prescribe, raceEstimate, type PrescriptionInput, type RecentEffort } from "./prescription";

const zones: HeartRateZones = { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };
const LT = 3.833; // 4:21/km
const targets = [{ distanceKm: 5, targetTimeS: 19 * 60 }, { distanceKm: 21.0975, targetTimeS: 87 * 60 }];
// 4 × 4 min à 4:01/km (26/08) et 3 × 2 km à 4:00/km (04/11).
const efforts: RecentEffort[] = [
  { localDate: "2026-08-26", kind: "intervals_vo2", title: "Fractionné 4 × 4 min", reps: 4, repDurationS: 239, workSpeedMps: 1000 / 241 },
  { localDate: "2026-11-04", kind: "intervals_vo2", title: "Fractionné long 3 × 2 km", reps: 3, repDurationS: 484, workSpeedMps: 1000 / 240 },
];

type Work = NonNullable<ActivityMetrics["work"]>;
const rep = (paceS: number, recoveryAfterS = 122) => ({ startOffsetS: 0, durationS: 500, distanceM: 2000, speedMps: 1000 / paceS, heartRateBpm: 168, maxHeartRateBpm: 174, recoveryAfterS });

const base: ActivityMetrics = {
  version: 10, restingHeartRateUsed: 46, kind: "intervals_vo2", family: "intervals", structure: "intervals", mainSpeedMps: 3.565, mainHeartRateBpm: 162.8, halves: null,
  work: { reps: 3, averageDurationS: 501, averageDistanceM: 2000, averageSpeedMps: 1000 / 250, averageHeartRateBpm: 168.3, peakHeartRateBpm: 174, speedCvPct: 1.5, fadePct: 3, paceSpreadSPerKm: 8, fadeSPerKm: 8, averageRecoveryS: 122, repsDetail: [rep(247), rep(249), rep(255)] },
  aerobic: null, zoneShares: null, elevationGainPerKm: 3.5, averageCadenceSpm: 171, blocks: null, dynamics: null,
};

function withWork(changes: Partial<Work>): ActivityMetrics {
  return { ...base, work: { ...(base.work as Work), ...changes } };
}

/** Ratio 1,6 avant la séance, corroboré ou non. */
function alert(reasons: string[]): LoadAlert {
  return { ratio: 1.6, ratioHigh: true, actionable: reasons.length > 0, reasons, typicalWeekLoad: 280 };
}

function input(metrics: ActivityMetrics, overrides: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    metrics, zones, lactateThresholdSpeedMps: LT, restingHeartRateBpm: 46, recentSpeedPerBeat: 0.03, movingTimeS: 2858, raceTargets: targets, efforts,
    reference: { repSpeedMps: 1000 / 242, repHeartRateBpm: 171, repSpreadSPerKm: 8, halvesFadeSPerKm: null },
    context: { loadAlert: alert([]), qualityBefore: [{ title: "Fractionné court 8 × 70 s", daysBefore: 3 }] },
    ...overrides,
  };
}

describe("allure du moment et objectif", () => {
  it("recoupe le seuil montre (4:06/km) et les répétitions récentes (4:01/km) en fourchette", () => {
    expect(raceEstimate(5, { lactateThresholdSpeedMps: LT, efforts })).toMatchObject({ fromThresholdS: 246, fromEffortsS: 241, fastS: 241, slowS: 246, centerS: 244 });
  });

  it("se contente du seuil sans répétitions longues", () => {
    expect(raceEstimate(5, { lactateThresholdSpeedMps: LT, efforts: [] })).toMatchObject({ fastS: 246, slowS: 246 });
  });

  it("situe le 5 km en 19:00 : pas encore à portée, écart chiffré, sans date", () => {
    const marker = goalMarker(targets, 5, { lactateThresholdSpeedMps: LT, efforts });
    if (!marker) throw new Error("attendu");
    expect(marker).toMatchObject({ goalPaceS: 228, gapS: 16, status: "out_of_reach" });
    expect(goalStatus(marker, null, null).verdict).toBe("Pas encore à portée : 16 s/km à gagner.");
    expect(goalStatus(marker, "2027-05-01", 166).timing).toContain("s/km à gagner par mois");
    // Dans une séance : seulement le repère, sans jugement.
    expect(paceReferenceSentence(marker)).toMatch(/^Repère 5 km du moment : 4:01–4:06\/km/);
    expect(paceReferenceSentence(marker)).not.toContain("portée");
  });
});

describe("prescribe, fractionné", () => {
  it("13/11 : ratio 1,6 sans signal qui le corrobore, dégradation dans sa norme : rien à reprocher, même format", () => {
    const result = prescribe(input(base));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.target).toMatchObject({ label: "allure 5 km du moment", paceFastS: 241, paceSlowS: 247 });
    expect(result.shouldHave).toEqual([]);
    // 4:10/km n'est pas « dans la cible » 4:01–4:07/km, même si l'écart est trop faible pour un reproche.
    expect(result.keep).toMatch(/^Régularité : 8 s\/km/);
    expect(result.next.cue).toBe("Même format 3 × 2 km à 4:01–4:07/km, récupération 3:00 ; 1re répétition à 4:07/km, pas plus vite.");
  });

  it("même séance avec une VFC sous sa plage : le placement devient la consigne principale, unique", () => {
    const result = prescribe(input(base, { context: { loadAlert: alert(["VFC sous ta plage habituelle"]), qualityBefore: [] } }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave).toEqual(["Placement : charge 7 jours déjà à 1,6 fois ta moyenne avant la séance, avec VFC sous ta plage habituelle ; reporte de 1 à 2 jours ou remplace par une endurance facile."]);
    expect(result.next.cue).toContain("sur une semaine sans pic de charge");
  });

  it("dégradation au-delà des comparables et récupération courte : la récupération devient la consigne", () => {
    const result = prescribe(input(withWork({ fadeSPerKm: 14, repsDetail: [rep(244), rep(249), rep(258)] }), { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave[0]).toBe("Récupération : 3:00 entre les répétitions au lieu de 2:02, pour ne plus perdre 14 s/km sur la dernière.");
  });

  it("départ trop rapide quand la 1re répétition est sous la fourchette", () => {
    const result = prescribe(input(withWork({ fadeSPerKm: 14, averageRecoveryS: 180, repsDetail: [rep(236, 180), rep(246, 180), rep(252, 180)] }), { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave[0]).toContain("Départ : 1re répétition à 3:56/km");
  });

  it("4/11 : 3 s/km plus vite mais FC bien plus haute que les comparables : consigne sur la FC, pas sur la vitesse", () => {
    const metrics = withWork({ averageSpeedMps: 1000 / 240, averageHeartRateBpm: 175, fadeSPerKm: -6, averageRecoveryS: 184, repsDetail: [rep(243, 184), rep(241, 184), rep(237, 184)] });
    const result = prescribe(input(metrics, { efforts: efforts.slice(0, 1), reference: { repSpeedMps: 1000 / 243, repHeartRateBpm: 168, repSpreadSPerKm: 10, halvesFadeSPerKm: null }, context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave).toEqual(["Intensité : tiens 4:01–4:07/km sans chercher plus vite ; FC des répétitions à 175 bpm contre 168 bpm sur tes comparables pour 3 s/km de mieux seulement."]);
    expect(result.next.cue).toContain("en visant 168 bpm");
  });

  it("écart marginal à la cible et rien de dégradé : « aurait dû » vide, une répétition de plus", () => {
    const metrics = withWork({ averageSpeedMps: 1000 / 244, fadeSPerKm: 1, averageRecoveryS: 180, repsDetail: [rep(244, 180), rep(244, 180), rep(245, 180)] });
    const result = prescribe(input(metrics, { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave).toEqual([]);
    expect(result.keep).toContain("à reproduire");
    expect(result.next.format).toBe("4 × 2 km");
  });

  it("format court en secondes : 8 × 70 s", () => {
    const short = { ...rep(229, 60), durationS: 70, distanceM: 312 };
    const metrics: ActivityMetrics = { ...base, kind: "intervals_short", work: { ...(base.work as Work), reps: 8, averageDurationS: 70, averageDistanceM: 312, averageSpeedMps: 1000 / 229, fadeSPerKm: -3, averageRecoveryS: 60, repsDetail: Array.from({ length: 8 }, () => short) } };
    const result = prescribe(input(metrics, { context: null, reference: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.next.format).toBe("9 × 70 s");
  });

  it("pas de consigne quand les répétitions ne sont pas reconnues", () => {
    expect(prescribe(input({ ...base, work: null })).status).toBe("none");
  });
});

describe("prescribe, continu", () => {
  it("endurance avec dérive : cible Z2 et départ plus lent", () => {
    const metrics: ActivityMetrics = { ...base, kind: "endurance", family: "easy", structure: "continuous", work: null, mainSpeedMps: 2.62, mainHeartRateBpm: 147.7, halves: { first: { speedMps: 2.62, heartRateBpm: 144 }, second: { speedMps: 2.62, heartRateBpm: 151 }, fadePct: 0, driftPct: 5.1, fadeSPerKm: -1 } };
    const result = prescribe(input(metrics));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.target).toMatchObject({ zone: "Z2", heartRateLow: 128, heartRateHigh: 148 });
    expect(result.shouldHave[0]).toContain("dérive cardiaque (5,1 %)");
    expect(result.next.cue).toContain("entre 128 et 148 bpm");
  });

  it("pas de consigne pour un « tempo » couru 40 s/km sous la cible", () => {
    const metrics: ActivityMetrics = { ...base, kind: "tempo", family: "steady", structure: "continuous", work: null, mainSpeedMps: 1000 / 314, mainHeartRateBpm: 156, halves: { first: { speedMps: 1000 / 302, heartRateBpm: 152 }, second: { speedMps: 1000 / 327, heartRateBpm: 160 }, fadePct: 8, driftPct: 10, fadeSPerKm: 25 } };
    expect(prescribe(input(metrics))).toMatchObject({ status: "none" });
  });
});
