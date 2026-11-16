import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { createLoadSummaryFixture } from "./rhythm.fixtures";
import { loadAlert } from "./load";
import { highLoadRatioFor, runningRhythm, spacingHours, type RhythmRun } from "./rhythm";

const today = "2026-11-15";

/** Semaine type répétée sur 12 semaines : jours (0 = lundi) et familles. */
function weeks(pattern: Array<[number, RhythmRun["family"]]>, count = 12): RhythmRun[] {
  const runs: RhythmRun[] = [];
  for (let week = count; week >= 1; week -= 1) {
    for (const [day, family] of pattern) {
      const date = addDays(today, -week * 7 + day + 1);
      if (date <= today) runs.push({ localDate: date, family });
    }
  }
  return runs;
}

describe("rythme habituel", () => {
  it("coureur à 1–2 sorties par semaine (profil de Bastien) : règles inchangées, 72 h et 1,5", () => {
    const rhythm = runningRhythm(weeks([[2, "intervals"], [6, "easy"]]).filter((_, index) => index % 4 !== 3), today);
    expect(rhythm.runsPerWeek12w).toBeLessThan(2);
    expect(rhythm.qualitySpacingDays).toBe(3);
    expect(rhythm.highLoadRatio).toBe(1.5);
  });

  it("coureur à 6 sorties dont 2 qualités espacées de 2 jours : 48 h et seuil de charge 1,3", () => {
    const rhythm = runningRhythm(weeks([[0, "easy"], [1, "intervals"], [2, "easy"], [3, "steady"], [4, "easy"], [6, "long"]]), today);
    expect(rhythm.runsPerWeek12w).toBeGreaterThanOrEqual(5.5);
    expect(rhythm.qualityGapMedianDays).toBe(2);
    expect(rhythm.qualitySpacingDays).toBe(2);
    expect(rhythm.highLoadRatio).toBe(1.3);
    expect(spacingHours(rhythm.qualitySpacingDays)).toBe("48 h");
  });

  it("deux qualités le même jour ou à 1 jour d'écart : on ne descend jamais sous 48 h", () => {
    const rhythm = runningRhythm(weeks([[1, "intervals"], [2, "steady"], [5, "easy"]]), today);
    expect(rhythm.qualitySpacingDays).toBe(2);
  });

  it("historique trop court : 72 h par défaut", () => {
    expect(runningRhythm([{ localDate: addDays(today, -2), family: "intervals" }, { localDate: addDays(today, -5), family: "intervals" }], today).qualitySpacingDays).toBe(3);
  });

  it("seuil de charge interpolé entre 3 et 5 sorties par semaine", () => {
    expect(highLoadRatioFor(1.4)).toBe(1.5);
    expect(highLoadRatioFor(4)).toBe(1.4);
    expect(highLoadRatioFor(7)).toBe(1.3);
  });

  it("un ratio de 1,4 corroboré est une hausse marquée pour un gros volume, pas pour Bastien", () => {
    const load = createLoadSummaryFixture(1.4);
    expect(loadAlert(load, { recoveryFlags: ["hrv_low"] }).actionable).toBe(false);
    expect(loadAlert(load, { recoveryFlags: ["hrv_low"] }, 1.3).actionable).toBe(true);
  });
});
