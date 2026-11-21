import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import type { HeartRateZones } from "@/lib/source/types";
import type { ActivityMetrics } from "./activity-metrics";
import { goalPages, regularityPage } from "./goal-pages";
import type { LoadSummary } from "./load";
import { prescribe } from "./prescription";
import type { RecoverySignals } from "./recovery";
import { suggestNextSession, type SuggestionInput, type SuggestionRun } from "./suggestion";

/**
 * Effort de course (effet aérobie ≥ 4,5) plus long que son format, et coureur multisport.
 * Cas réel : semi couru en compétition, 84 min à FC moyenne en Z4, classé « continu au seuil »,
 * chez un coureur qui court une fois par semaine et nage ou roule autant.
 */
const zones: HeartRateZones = { floors: [86, 103, 120, 137, 154], maxHeartRateBpm: 171, lactateThresholdHeartRateBpm: 151, method: "HR_MAX" };

const semi: ActivityMetrics = {
  version: 14, restingHeartRateUsed: 45, kind: "threshold", family: "steady", structure: "continuous", mainSpeedMps: 4.237, mainHeartRateBpm: 141,
  halves: { first: { speedMps: 4.2, heartRateBpm: 139 }, second: { speedMps: 4.27, heartRateBpm: 143 }, fadePct: -1, driftPct: -1, fadeSPerKm: -3 },
  work: null, aerobic: null, zoneShares: [0, 0, 0.18, 0.81, 0.01], elevationGainPerKm: 3, averageCadenceSpm: 179, blocks: null, dynamics: null,
};

function prescribeSemi(aerobicTrainingEffect: number | null, minutes = 84) {
  return prescribe({ metrics: semi, zones, lactateThresholdSpeedMps: null, restingHeartRateBpm: 45, recentSpeedPerBeat: 0.04, movingTimeS: minutes * 60, aerobicTrainingEffect, raceTargets: [], efforts: [], reference: null, context: null });
}

describe("continu au seuil mené comme une course", () => {
  it("plus long que le format et effet aérobie ≥ 4,5 : récupération, pas « même effort » à refaire", () => {
    const result = prescribeSemi(5);
    if (result.status !== "ok") throw new Error("consigne attendue");
    expect(result.shouldHave).toEqual([]);
    expect(result.next.format).toBe("footing facile");
    expect(result.next.cue).toContain("Après un effort de cette durée");
    expect(result.next.target).toMatchObject({ zone: "Z2", heartRateLow: 103, heartRateHigh: 119 });
  });

  it("même durée sans effet de course, ou dans son format : consigne de seuil habituelle", () => {
    for (const result of [prescribeSemi(4.3), prescribeSemi(5, 55)]) {
      if (result.status !== "ok") throw new Error("consigne attendue");
      expect(result.next.cue).toContain("Même effort");
    }
  });
});

const today = "2026-11-21";
const load: LoadSummary = { acute7d: 250, chronicWeekly28d: 150, ratio: 1.65, intensity28d: { low: 0.7, moderate: 0.1, high: 0.2, totalMinutes: 300 }, weeks: [], runsPerWeek8w: 0.9, runKmPerWeek8w: 10 };
const recovery: RecoverySignals = { hrv: { latest: null, latestDate: null, baseline: null, delta: null, series: [], baselineLow: null, baselineHigh: null, status: null }, sleep: { latest: null, latestDate: null, baseline: null, delta: null, series: [], score: null, baselineScore: null }, restingHr: { latest: null, latestDate: null, baseline: null, delta: null, series: [] }, flags: [], state: "ok" };

function run(daysAgo: number, kind: SuggestionRun["kind"], family: SuggestionRun["family"], minutes: number, aerobicTrainingEffect = 3): SuggestionRun {
  return { localDate: addDays(today, -daysAgo), kind, family, movingTimeS: minutes * 60, aerobicTrainingEffect };
}

function input(runs: SuggestionRun[]): SuggestionInput {
  return { today, runs, zones, restingHeartRateBpm: 45, recentSpeedPerBeat: 0.04, easyHeartRateBpm: 118, lactateThresholdSpeedMps: null, load, recovery, goal: null, loadAlert: { ratio: 1.65, ratioHigh: true, actionable: false, reasons: [], typicalWeekLoad: 240 } };
}

describe("sortie longue après un semi en course", () => {
  it("la durée se cale sur les sorties d'entraînement, pas sur la course", () => {
    const result = suggestNextSession(input([run(21, "endurance", "easy", 65), run(18, "endurance", "easy", 56), run(6, "threshold", "steady", 84, 5)]));
    expect(result.primary.type).toBe("long");
    expect(result.primary.durationMin).toBe(70);
  });

  it("un continu dur sans effet de course (< 4,5) reste un repère de durée", () => {
    const result = suggestNextSession(input([run(21, "endurance", "easy", 40), run(6, "threshold", "steady", 70, 4.3)]));
    expect(result.primary.durationMin).toBe(75);
  });
});

describe("régularité d'un coureur multisport", () => {
  const weekly = Array.from({ length: 8 }, (_, week) => ({ localDate: addDays("2026-11-15", -7 * week), distanceM: 10_000 })).reverse();
  it("sans objectif : cible = son rythme de course (1 au moins) s'il fait autant d'autres sports, 2 sinon", () => {
    const base = { level: "confirmed" as const, gaps: [], markers: [], runs: weekly, today, goal: null, habitualRunsPerWeek: 0.9 };
    expect(goalPages({ ...base, crossTraining: true }).at(-1)).toMatchObject({ kind: "regularity", target: 1, streakWeeks: 8 });
    expect(goalPages(base).at(-1)).toMatchObject({ kind: "regularity", target: 2 });
  });
  it("singulier à une sortie", () => {
    expect(regularityPage([], today, 1).next).toBe("Prochain palier : 1 sortie cette semaine pour lancer ta série.");
  });
});
