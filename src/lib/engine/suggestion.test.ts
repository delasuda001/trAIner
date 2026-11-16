import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import type { HeartRateZones } from "@/lib/source/types";
import type { LoadSummary } from "./load";
import type { RecoverySignals } from "./recovery";
import { suggestNextSession, type SuggestionInput, type SuggestionRun } from "./suggestion";

const today = "2026-11-15";
const zones: HeartRateZones = { floors: [110, 128, 149, 159, 167], maxHeartRateBpm: 189, lactateThresholdHeartRateBpm: 169, method: "LACTATE_THRESHOLD" };

const load: LoadSummary = { acute7d: 200, chronicWeekly28d: 200, ratio: 1, intensity28d: { low: 0.7, moderate: 0.15, high: 0.15, totalMinutes: 300 }, weeks: [], runsPerWeek8w: 1.5, runKmPerWeek8w: 15 };

function recovery(state: RecoverySignals["state"], flags: RecoverySignals["flags"] = []): RecoverySignals {
  const empty = { latest: null, latestDate: null, baseline: null, delta: null, series: [] };
  return { hrv: { ...empty, baselineLow: null, baselineHigh: null, status: null }, sleep: { ...empty, score: null, baselineScore: null }, restingHr: empty, flags, state };
}

function run(daysAgo: number, kind: SuggestionRun["kind"], family: SuggestionRun["family"], minutes = 50): SuggestionRun {
  return { localDate: addDays(today, -daysAgo), kind, family, movingTimeS: minutes * 60, aerobicTrainingEffect: family === "intervals" ? 4.2 : 2.8 };
}

function input(runs: SuggestionRun[], overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return { today, runs, zones, restingHeartRateBpm: 46, recentSpeedPerBeat: 0.03, easyHeartRateBpm: 135, lactateThresholdSpeedMps: 3.833, load, recovery: recovery("ok"), goal: null, ...overrides };
}

describe("suggestNextSession", () => {
  it("après un fractionné il y a 2 jours, propose de l'endurance en Z2 dès aujourd'hui", () => {
    const result = suggestNextSession(input([run(9, "endurance", "easy"), run(2, "intervals_vo2", "intervals", 48)]));
    expect(result.primary.type).toBe("endurance");
    expect(result.primary.target).toMatchObject({ zone: "Z2", heartRateLow: 130, heartRateHigh: 140 });
    // Allure centrée sur son allure mesurée à 135 bpm (0,03 × 89 = 2,67 m/s ≈ 6:15/km), ±8 s/km.
    const fast = 1000 / (result.primary.target?.paceFastMps ?? 1);
    const slow = 1000 / (result.primary.target?.paceSlowMps ?? 1);
    expect(Math.round(slow - fast)).toBe(16);
    expect(result.when.label).toBe("Aujourd'hui");
  });

  it("sans qualité depuis 8 jours, propose une séance au seuil calée sur l'allure seuil de la montre", () => {
    const result = suggestNextSession(input([run(12, "intervals_vo2", "intervals"), run(4, "endurance", "easy")]));
    expect(result.primary.type).toBe("threshold");
    expect(result.primary.target?.heartRateLow).toBe(159);
    expect(Math.round(1000 / (result.primary.target?.paceSlowMps ?? 1))).toBe(Math.round(1000 / (3.833 * 0.97)));
  });

  it("alterne seuil et VO2max d'une séance de qualité à l'autre", () => {
    const result = suggestNextSession(input([run(10, "intervals_threshold", "intervals"), run(3, "endurance", "easy")]));
    expect(result.primary.type).toBe("vo2max");
  });

  it("propose une sortie longue quand la qualité est faite et qu'aucune longue n'a été courue depuis 2 semaines", () => {
    const result = suggestNextSession(input([run(20, "long", "long", 80), run(5, "intervals_threshold", "intervals"), run(3, "endurance", "easy")]));
    expect(result.primary.type).toBe("long");
    expect(result.primary.durationMin).toBeGreaterThanOrEqual(70);
  });

  it("après une longue coupure, propose une reprise facile", () => {
    expect(suggestNextSession(input([run(20, "endurance", "easy")])).primary.title).toBe("Reprise en endurance");
  });

  it("donne une alternative facile quand la récupération est dégradée", () => {
    const result = suggestNextSession(input([run(12, "intervals_vo2", "intervals"), run(4, "endurance", "easy")], { recovery: recovery("poor", ["hrv_low", "resting_hr_high"]) }));
    expect(result.primary.type).toBe("threshold");
    expect(result.alternative?.type).toBe("recovery_run");
    expect(result.alternative?.reason).toContain("VFC");
  });

  it("donne la séance d'après, cohérente avec 2 sorties par semaine", () => {
    const result = suggestNextSession(input([run(12, "intervals_vo2", "intervals"), run(4, "endurance", "easy")]));
    expect(result.primary.type).toBe("threshold");
    expect(result.then?.type).toBe("endurance");
    expect(result.then && result.then.when.date > result.when.date).toBe(true);
  });

  it("place la séance sur un jour préféré et passe en spécifique à l'approche de la course", () => {
    const goal = { eventDate: addDays(today, 20), distanceKm: 10, targetPaceMps: 1000 / 260, runsPerWeek: 2, preferredDays: [2, 5] };
    const result = suggestNextSession(input([run(12, "intervals_vo2", "intervals"), run(4, "endurance", "easy")], { goal }));
    expect(result.primary.type).toBe("specific");
    expect([2, 5]).toContain((new Date(`${result.when.date}T12:00:00Z`).getUTCDay() + 6) % 7);
  });

  it("affûte la dernière semaine avant la course", () => {
    const goal = { eventDate: addDays(today, 4), distanceKm: 10, targetPaceMps: 1000 / 260, runsPerWeek: 2, preferredDays: [] };
    expect(suggestNextSession(input([run(5, "endurance", "easy")], { goal })).primary.type).toBe("taper");
  });

  it("avec une seule sortie par semaine, alterne qualité et sortie longue", () => {
    const goal = { eventDate: null, distanceKm: null, targetPaceMps: null, runsPerWeek: 1, preferredDays: [] };
    expect(suggestNextSession(input([run(7, "intervals_threshold", "intervals")], { goal })).primary.type).toBe("long");
  });

  it("ne programme jamais plus d'une séance et respecte 48 h après une séance dure", () => {
    const result = suggestNextSession(input([run(1, "intervals_vo2", "intervals")]));
    expect(result.when.date).toBe(addDays(today, 1));
    expect(Object.keys(result.primary)).not.toContain("plan");
  });
});
