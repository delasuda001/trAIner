import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "@/lib/engine/activity-metrics";
import type { ComparisonDeltas } from "@/lib/engine/comparable";
import { classifyVerdict } from "@/lib/engine/verdict";
import type { HeartRateZones } from "@/lib/source/types";
import { allowedNumbers, findUnsupportedCauses, findUnsupportedNumbers, findZoneContradictions } from "./number-guard";
import { zoneOf } from "@/lib/engine/zones";
import { buildSessionPayload, buildSessionPrompt, SESSION_SYSTEM_PROMPT } from "./session-coach";

const zones: HeartRateZones = { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };
const session = { name: "Toronto", localDate: "2026-11-13", sport: "running", distanceM: 10137, movingTimeS: 2865, averageSpeedMps: 3.539, averageHeartRateBpm: 160, elevationGainM: 35, averageCadenceSpm: 166.8, averageTemperatureC: 17 };

function intervalMetrics(reps: number): ActivityMetrics {
  const rep = { startOffsetS: 600, durationS: 120, distanceM: 520, speedMps: 4.3, heartRateBpm: 170, maxHeartRateBpm: 176, recoveryAfterS: 90 };
  return {
    version: 6, restingHeartRateUsed: 46, kind: "intervals_vo2", family: "intervals", structure: "intervals", mainSpeedMps: 3.5, mainHeartRateBpm: 160, halves: null,
    work: { reps, averageDurationS: 120, averageDistanceM: 520, averageSpeedMps: 4.3, averageHeartRateBpm: 170, peakHeartRateBpm: 176, speedCvPct: 2.1, fadePct: 1.4, paceSpreadSPerKm: 6, fadeSPerKm: 3, averageRecoveryS: 90, repsDetail: Array.from({ length: reps }, () => rep) },
    aerobic: null, zoneShares: [0.05, 0.1, 0.2, 0.25, 0.4], elevationGainPerKm: 3.5, averageCadenceSpm: 167, blocks: null, dynamics: null,
  };
}

const deltas: ComparisonDeltas = {
  dynamicsReference: null,
  fadeSPerKm: { current: null, reference: null },
  count: 5, current: { speedMps: 3.5, heartRateBpm: 160 }, reference: { speedMps: 3.4, heartRateBpm: 158 }, paceAtEqualHrGainSPerKm: null, hrAtEqualPaceDeltaBpm: null,
  drift: { current: null, reference: null }, fade: { current: null, reference: null },
  work: { current: { speedMps: 4.3, heartRateBpm: 170, speedCvPct: 2.1, fadePct: 1.4 }, reference: { speedMps: 4.25, heartRateBpm: 171, speedCvPct: 3, fadePct: 2, paceSpreadSPerKm: 8 }, paceAtEqualHrGainSPerKm: 2 },
};

const comparables = Array.from({ length: 5 }, (_, index) => ({ localDate: `2026-10-0${index + 1}`, title: "Fractionné 6 × 500 m", ageDays: 40 + index, movingTimeS: 2800, distanceM: 9000, mainSpeedMps: 3.4, mainHeartRateBpm: 158, workSpeedMps: 4.25, workHeartRateBpm: 171 }));
const context = { loadRatio: 1.4, loadBefore: { value: 326, reference: 234, ratio: 1.39 }, acute7d: 326, chronicWeekly28d: 234, qualityBefore14d: [{ localDate: "2026-11-04", title: "Fractionné 5 × 1 km", daysBefore: 9 }], daysSincePreviousRun: 3, recovery: { hrv: { latest: 60, baselineLow: 52, baselineHigh: 73 }, restingHr: { latest: 46, delta: -1 }, sleep: { latest: 29000, delta: 600 }, flags: [] } };

function payloadFor(reps: number) {
  const metrics = intervalMetrics(reps);
  return buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: { objectif: "10 km", temps_vise: "43:00" } });
}

describe("charge utile du débrief", () => {
  it("reste sous ~2 650 tokens même pour 20 répétitions (≈ 3,2 caractères par token en français ; session-v13 : +~40 en entrée pour la ligne objectif ; session-v16 : +~150 pour les pistes à côté et la règle prescriptive)", () => {
    const size = buildSessionPrompt(payloadFor(20)).length + SESSION_SYSTEM_PROMPT.length;
    expect(size / 3.2).toBeLessThan(2650);
  });

  it("détaille au plus 8 répétitions", () => {
    expect(payloadFor(20).structure).toMatchObject({ detail_repetitions: expect.any(Array) });
    expect((payloadFor(20).structure as { detail_repetitions: string[] }).detail_repetitions).toHaveLength(8);
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

describe("ressenti et dynamique dans la charge utile", () => {
  it("transmet l'effort perçu et la note au coach", () => {
    const metrics = intervalMetrics(3);
    const payload = buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {}, feeling: { perceivedEffort: 8, note: "jambes lourdes, nuit courte" } });
    expect(payload.ressenti).toEqual({ effort_percu: "8/10", note: "jambes lourdes, nuit courte" });
    expect(payload.dynamique_de_course).toBeNull();
  });
});

describe("zone d'une FC arrondie", () => {
  it("annote 166,6 bpm comme 167 bpm (Z5) et non (Z4), sinon le garde-fou rejette la réponse", () => {
    const metrics = intervalMetrics(3);
    const work = { ...(metrics.work as NonNullable<ActivityMetrics["work"]>), averageHeartRateBpm: 166.6 };
    const payload = buildSessionPayload({ session, metrics: { ...metrics, work }, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {} });
    expect(JSON.stringify(payload)).toContain("167 bpm (Z5)");
    expect(JSON.stringify(payload)).not.toContain("167 bpm (Z4)");
  });
});

describe("charge dans le résumé : une seule référence, ratio = valeur / référence", () => {
  it("chaque « X, soit R fois … (Y) » respecte R ≈ X / Y", () => {
    const text = JSON.stringify(payloadFor(6));
    const triplets = [...text.matchAll(/(\d+), soit (\d+(?:,\d+)?) fois [^()"]*\((\d+)\)/g)];
    expect(triplets.length).toBeGreaterThan(0);
    for (const [, value, ratio, reference] of triplets) {
      expect(Math.abs(Number(ratio.replace(",", ".")) - Number(value) / Number(reference))).toBeLessThanOrEqual(0.051);
    }
    // Plus de seconde ligne de charge « séance comprise » avec une autre référence.
    expect(text).not.toContain("seance_comprise");
  });
});

describe("session-v13 : répétitions courtes, foulée, écart à l'objectif, seuil", () => {
  it("répétitions de moins de 60 s : ni détail par répétition ni écart entre la plus rapide et la plus lente", () => {
    const metrics = intervalMetrics(14);
    const work = { ...(metrics.work as NonNullable<ActivityMetrics["work"]>), averageDurationS: 31, repsDetail: (metrics.work as NonNullable<ActivityMetrics["work"]>).repsDetail.map((rep) => ({ ...rep, durationS: 31 })) };
    const payload = buildSessionPayload({ session, metrics: { ...metrics, work }, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {} });
    const structure = payload.structure as Record<string, unknown>;
    expect(structure.detail_repetitions).toBe("—");
    expect(structure).not.toHaveProperty("ecart_entre_rep_la_plus_rapide_et_la_plus_lente");
    expect(String(structure.precision)).toContain("imprécise au GPS");
  });

  it("foulée sans écart notable : le coach est prié de ne pas en parler", () => {
    const metrics = intervalMetrics(3);
    const values = { cadenceSpm: 171, groundContactMs: 259, verticalOscillationMm: 86, verticalRatioPct: 6, stepLengthM: 1.39 };
    const withDynamics: ActivityMetrics = { ...metrics, dynamics: { ...values, basis: "reps", early: values, late: values } };
    const payload = buildSessionPayload({ session, metrics: withDynamics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {} });
    expect(payload.dynamique_de_course).toContain("n'en parle pas");
  });

  it("transmet l'écart à l'objectif et l'origine du seuil, dont les chiffres passent le garde-fou", () => {
    const metrics = intervalMetrics(3);
    const gap = "Levier principal pour le semi : sorties par semaine (1,4, repère 3 au moins). Passe à 3 sorties par semaine : ajoute un footing facile de 30 à 40 min en Z2.";
    const payload = buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 4, thresholdBasis: "seuil observé 4:10/km (3 × 2 km du 13 nov. à 4:10/km pour 168 bpm), la montre l'estime à 4:21/km", context, goal: {}, goalGaps: [gap] });
    expect(payload).toMatchObject({ ecart_objectif: [gap] });
    expect(payload.reperes_athlete.seuil).toContain("seuil observé 4:10/km");
    // Z5 de la montre dès 167 et seuil à 169 : le seuil est présenté à la limite Z4–Z5, pas « en Z5 », et le garde-fou l'accepte.
    expect(payload.reperes_athlete.seuil).toContain("169 bpm (limite Z4–Z5)");
    expect(findZoneContradictions("Ton seuil, 169 bpm (limite Z4–Z5), n'a pas été atteint.", (hr) => zoneOf(hr, zones))).toEqual([]);
    expect(findUnsupportedNumbers("Cette séance ne travaille pas ton levier principal : passe à 3 sorties par semaine avec un footing de 30 à 40 min.", allowedNumbers(payload))).toEqual([]);
    // Sans objectif chiffré, pas de clé.
    expect(buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {} })).not.toHaveProperty("ecart_objectif");
  });
});

describe("causes fournies par le moteur", () => {
  it("liste les seuls facteurs qui peuvent expliquer un écart, sinon « aucune »", () => {
    const metrics = intervalMetrics(3);
    const calm = buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {} });
    // Qualité 9 jours avant, rien de dégradé, ratio non corroboré : aucune cause.
    expect(calm.causes_possibles).toBe("aucune");
    const busy = buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context: { ...context, qualityBefore14d: [{ localDate: "2026-11-11", title: "Fractionné court 8 × 70 s", daysBefore: 2 }], recovery: { ...context.recovery, flags: ["hrv_low"] } }, goal: {}, feeling: { perceivedEffort: 8, note: "" } });
    expect(busy.causes_possibles).toEqual(["Fractionné court 8 × 70 s, 2 jours avant", "VFC sous la plage habituelle", "effort perçu 8/10"]);
  });

  it("refuse une explication inventée quand aucune cause n'est fournie, l'accepte sinon", () => {
    const metrics = intervalMetrics(3);
    const calm = buildSessionPayload({ session, metrics, deltas, verdict: classifyVerdict(metrics, deltas), comparables, zones, lactateThresholdSpeedMps: 3.833, context, goal: {} });
    expect(findUnsupportedCauses("Les dernières sont plus lentes : le départ était trop rapide pour tenir 14 répétitions.", calm)).toHaveLength(1);
    expect(findUnsupportedCauses("Cause probable : la séance d'il y a 3 jours.", calm)).toHaveLength(1);
    expect(findUnsupportedCauses("Séance régulière, dans ta norme.", calm)).toEqual([]);
    const busy = { ...calm, causes_possibles: ["VFC sous la plage habituelle"] };
    expect(findUnsupportedCauses("Cause probable : VFC sous la plage habituelle.", busy)).toEqual([]);
  });
});
