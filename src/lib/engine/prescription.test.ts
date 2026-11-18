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
    expect(result.shouldHave).toEqual(["Placement : charge 7 jours déjà à 1,6 fois ta moyenne, avec VFC sous ta plage habituelle ; reporte de 1 à 2 jours ou remplace par une endurance facile."]);
    expect(result.next.cue).toContain("sur une semaine sans pic de charge");
  });

  it("dégradation au-delà des comparables et récupération courte : la récupération devient la consigne", () => {
    const result = prescribe(input(withWork({ fadeSPerKm: 14, paceSpreadSPerKm: 14, repsDetail: [rep(244), rep(249), rep(258)] }), { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave[0]).toBe("Récupération : 3:00 entre les répétitions au lieu de 2:02, pour ne plus perdre 14 s/km sur la dernière.");
  });

  it("départ trop rapide quand la 1re répétition est sous la fourchette", () => {
    const result = prescribe(input(withWork({ fadeSPerKm: 14, paceSpreadSPerKm: 16, averageRecoveryS: 180, repsDetail: [rep(236, 180), rep(246, 180), rep(252, 180)] }), { context: null }));
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

  it("30/30 : la récupération proposée reste égale à l'effort (pas 1 min)", () => {
    const short = { ...rep(229, 30), durationS: 30, distanceM: 131 };
    const metrics: ActivityMetrics = { ...base, kind: "intervals_short", work: { ...(base.work as Work), reps: 14, averageDurationS: 30, averageDistanceM: 131, averageSpeedMps: 1000 / 229, fadeSPerKm: -3, averageRecoveryS: 30, repsDetail: Array.from({ length: 14 }, () => short) } };
    const result = prescribe(input(metrics, { context: null, reference: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.next.recoveryS).toBe(30);
    // Cible VMA (seuil × 1,18) plus rapide que l'allure 1 500 m (× 1,14) d'un format plus long.
    expect(result.target.label).toBe("VMA (allure 1 000 m)");
    const longer = prescribe(input({ ...metrics, work: { ...(metrics.work as Work), averageDurationS: 70, repsDetail: Array.from({ length: 8 }, () => ({ ...short, durationS: 70 })) } }, { context: null, reference: null }));
    if (longer.status !== "ok") throw new Error("attendu ok");
    expect(longer.target.label).toBe("vitesse (allure 1 500 m)");
    expect((result.target.paceFastS as number) < (longer.target.paceFastS as number)).toBe(true);
    expect(result.shouldHave.join(" ")).not.toContain("Récupération");
  });

  it("répétitions de moins de 60 s : aucune répétition jugée isolément, seulement la moyenne et la tenue", () => {
    // 14 × 30 s à 3:35/km de moyenne, 1re répétition à 3:25 (bruit GPS probable), dernières 18 s/km plus lentes.
    const paces = [205, 209, 205, 210, 212, 214, 213, 215, 216, 218, 220, 222, 223, 224];
    const reps = paces.map((paceS) => ({ ...rep(paceS, 30), durationS: 31, distanceM: 150 }));
    const metrics: ActivityMetrics = { ...base, kind: "intervals_short", work: { ...(base.work as Work), reps: 14, averageDurationS: 31, averageDistanceM: 150, averageSpeedMps: 1000 / 215, fadeSPerKm: 18, paceSpreadSPerKm: 26, averageRecoveryS: 31, repsDetail: reps } };
    const result = prescribe(input(metrics, { context: null, reference: { repSpeedMps: 1000 / 212, repHeartRateBpm: 168, repSpreadSPerKm: 22, halvesFadeSPerKm: null } }));
    if (result.status !== "ok") throw new Error("attendu ok");
    const text = [...result.shouldHave, result.keep ?? "", result.next.cue].join(" ");
    expect(text).not.toContain("1re répétition");
    expect(text).not.toContain("Départ");
    expect(result.shouldHave).toEqual(["Gestion : tes dernières répétitions perdent 18 s/km ; vise 3:38–3:44/km en moyenne sur toute la série, sans chercher plus vite au début."]);
    expect(result.next.cue).toContain("règle-toi sur l'effort et la moyenne");
    // Perte dans le bruit GPS (< 10 s/km) : rien à reprocher.
    const steady = prescribe(input({ ...metrics, work: { ...(metrics.work as Work), fadeSPerKm: 7, averageSpeedMps: 1000 / 221 } }, { context: null, reference: null }));
    if (steady.status !== "ok") throw new Error("attendu ok");
    expect(steady.shouldHave).toEqual([]);
    expect(steady.keep).toBe("Répétitions à 3:41/km en moyenne dans la cible 3:38–3:44/km : à reproduire.");
  });

  it("répétitions longues au seuil : FC cible autour de la FC seuil (164–171), pas la Z4 Garmin sous le seuil", () => {
    const result = prescribe(input({ ...base, kind: "intervals_threshold" }, { context: null }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.target).toMatchObject({ label: "seuil", heartRateLow: 164, heartRateHigh: 171, zone: "Z4–Z5", paceFastS: 258, paceSlowS: 265 });
    // FC au-dessus de la cible et plus haute que les comparables : une seule consigne d'intensité.
    const hot = prescribe(input({ ...base, kind: "intervals_threshold", work: { ...(base.work as Work), averageHeartRateBpm: 175, averageSpeedMps: 1000 / 260 } }, { context: null, reference: { repSpeedMps: 1000 / 260, repHeartRateBpm: 168, repSpreadSPerKm: 8, halvesFadeSPerKm: null } }));
    if (hot.status !== "ok") throw new Error("attendu ok");
    expect(hot.shouldHave.filter((line) => line.startsWith("Intensité"))).toEqual(["Intensité : repasse sous 171 bpm (Z4–Z5) ; 175 bpm, c'est déjà plus que ce format."]);
  });

  it("seuil observé : les phrases disent d'où vient le seuil", () => {
    expect(raceEstimate(21.0975, { lactateThresholdSpeedMps: 4, thresholdLabel: "seuil observé", efforts: [] })?.basis).toBe("seuil observé 4:10/km");
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

describe("prescribe, séance réussie (10/11)", () => {
  const short = (paceS: number) => ({ ...rep(paceS, 60), durationS: 70, distanceM: 312 });
  const paces = [228, 222, 227, 228, 229, 220, 221, 222];
  const metrics: ActivityMetrics = { ...base, kind: "intervals_short", work: { ...(base.work as Work), reps: 8, averageDurationS: 70, averageDistanceM: 312, averageSpeedMps: 1000 / 225, paceSpreadSPerKm: 9, fadeSPerKm: -3, averageRecoveryS: 60, repsDetail: paces.map(short) } };

  it("au-dessus des repères et récupération normale : pas de reproche de placement, mais les répétitions trop rapides", () => {
    const result = prescribe(input(metrics, { reference: { repSpeedMps: 1000 / 233, repHeartRateBpm: 171, repSpreadSPerKm: 28, halvesFadeSPerKm: null }, context: { loadAlert: alert(["charge inhabituelle sur 12 semaines (semaine médiane 189)"]), qualityBefore: [], recoveryFlags: [], verdictLevel: "above" } }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave).toHaveLength(1);
    expect(result.shouldHave[0]).toMatch(/^Allure : reste dans 3:46–3:52\/km sur chaque répétition ; 4 sur 8 étaient plus rapides \(3:40–3:42\/km\)/);
    // Régularité comparée au même indicateur des comparables (écart plus rapide / plus lente).
    expect(result.keep).toBe("Régularité : 9 s/km entre la répétition la plus rapide et la plus lente, mieux que tes comparables (28 s/km).");
  });

  it("même séance avec une VFC basse : le placement redevient la consigne", () => {
    const result = prescribe(input(metrics, { context: { loadAlert: alert(["VFC sous ta plage habituelle"]), qualityBefore: [], recoveryFlags: ["hrv_low"], verdictLevel: "above" } }));
    if (result.status !== "ok") throw new Error("attendu ok");
    expect(result.shouldHave[0]).toMatch(/^Placement/);
  });
});

describe("placement adapté au rythme du coureur", () => {
  const lines = (result: ReturnType<typeof prescribe>) => (result.status === "ok" ? result.shouldHave : []);
  const twoDays = { loadAlert: { ...alert([]), ratio: 1, ratioHigh: false }, qualityBefore: [{ title: "Seuil 3 × 10 min", daysBefore: 2 }] };

  it("qualité 2 jours avant : reproche de placement à 72 h par défaut (coureur à 1–2 sorties)", () => {
    const result = prescribe(input(base, { context: twoDays }));
    expect(lines(result)[0]).toBe("Placement : Seuil 3 × 10 min seulement 2 jours avant ; laisse 72 h entre deux séances de qualité.");
  });

  it("qualité 2 jours avant chez un coureur qui enchaîne d'habitude à 48 h : pas de reproche", () => {
    const result = prescribe(input(base, { context: { ...twoDays, qualitySpacingDays: 2 } }));
    expect(lines(result).join(" ")).not.toContain("Placement");
  });

  it("qualité la veille chez ce même coureur : reproche avec son propre écart (48 h)", () => {
    const result = prescribe(input(base, { context: { ...twoDays, qualityBefore: [{ title: "Seuil 3 × 10 min", daysBefore: 1 }], qualitySpacingDays: 2 } }));
    expect(lines(result)[0]).toBe("Placement : Seuil 3 × 10 min seulement 1 jour avant ; laisse 48 h entre deux séances de qualité.");
  });
});

