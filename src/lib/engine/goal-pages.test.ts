import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { detectLevel, type LevelRun } from "./athlete-level";
import { goalGap } from "./goal-gap";
import { chronoPage, distancePage, goalPages, regularityPage } from "./goal-pages";

const today = "2026-11-19"; // jeudi

/** `perWeek` sorties par semaine pendant `weeks` semaines terminées (lundi et mercredi…), de `km` km. */
function runs(weeks: number, perWeek: number, km: number, family = "easy"): LevelRun[] {
  const list: LevelRun[] = [];
  for (let week = weeks; week >= 1; week -= 1) for (let index = 0; index < perWeek; index += 1) list.push({ localDate: addDays("2026-11-16", -7 * week + index * 2), distanceM: km * 1000, family });
  return list;
}

describe("niveau du coureur", () => {
  it("débutant : moins de 6 mois de course", () => {
    expect(detectLevel(runs(10, 2, 4), today).level).toBe("beginner");
  });
  it("confirmé : toute l'année avec des séances structurées, même à faible volume", () => {
    const year = runs(52, 1, 9).concat(runs(12, 1, 8, "intervals").map((run) => ({ ...run, localDate: addDays(run.localDate, 1) })));
    year.sort((a, b) => a.localDate.localeCompare(b.localDate));
    const assessment = detectLevel(year, today);
    expect(assessment.level).toBe("confirmed");
    expect(assessment.signals.kmPerWeek12w).toBeLessThan(20);
  });
  it("intermédiaire : régulier sur un an, sans séance structurée", () => {
    expect(detectLevel(runs(52, 2, 7), today).level).toBe("intermediate");
  });
});

describe("pages d'objectif", () => {
  it("régularité : série de semaines à la cible, palier suivant", () => {
    const page = regularityPage(runs(3, 2, 5), today, 2);
    expect(page.streakWeeks).toBe(3);
    expect(page.milestone).toBe(4);
    expect(page.next).toBe("Prochain palier : 4 semaines d'affilée à 2 sorties (encore 1).");
  });
  it("régularité : pas de série, on la lance", () => {
    expect(regularityPage([], today, 2).next).toBe("Prochain palier : 2 sorties cette semaine pour lancer ta série.");
  });
  it("distance : un kilomètre de plus que la plus longue, puis la distance suivante une fois atteinte", () => {
    expect(distancePage(runs(6, 2, 5.4), today, 10)).toMatchObject({ longestKm: 5.4, reached: false, next: "Prochain palier : 6 km d'une traite, en facile (1 km de plus que ta plus longue)." });
    expect(distancePage(runs(6, 2, 10.1), today, 10).next).toContain("Prochain palier : semi");
  });
  it("chrono atteint : palier 2 % plus vite", () => {
    const gap = goalGap({ target: { distanceKm: 5, targetTimeS: 1500 }, runs: runs(8, 4, 8).concat([{ localDate: addDays(today, -3), distanceM: 12000, family: "easy" }]), today, thresholdSpeedMps: 1000 / 270 });
    if (!gap) throw new Error("attendu");
    const page = chronoPage(gap, { race: "5 km", goalTimeS: 1500, goalPaceS: 300, estimate: { centerS: 295, fastS: 290, slowS: 300 } as never, realisticTimeS: 1475, gapS: -5, status: "reachable" });
    expect(page.reached).toBe(true);
    expect(page.next).toBe("À portée. Prochain palier : 5 km en 24:30.");
  });
  it("ordre : régularité d'abord pour un débutant, chrono d'abord sinon", () => {
    const gap = goalGap({ target: { distanceKm: 21.0975, targetTimeS: 5220 }, runs: runs(8, 1, 9), today, thresholdSpeedMps: 1000 / 250 });
    const base = { gaps: gap ? [gap] : [], markers: [], runs: runs(8, 1, 9), today, goal: { distanceKm: null, targetTimeS: null, runsPerWeek: 2 }, habitualRunsPerWeek: 1 };
    expect(goalPages({ ...base, level: "beginner" }).map((page) => page.kind)).toEqual(["regularity", "chrono"]);
    expect(goalPages({ ...base, level: "confirmed" }).map((page) => page.kind)).toEqual(["chrono", "regularity"]);
    expect(goalPages({ ...base, gaps: [], level: "beginner", goal: { distanceKm: 10, targetTimeS: null, runsPerWeek: 2 } }).map((page) => page.kind)).toEqual(["regularity", "distance"]);
  });
});
