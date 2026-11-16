import { describe, expect, it } from "vitest";
import { loadAlert, type LoadSummary, type WeekVolume } from "./load";

const week = (load: number): WeekVolume => ({ weekStart: "2026-08-03", runKm: 15, runCount: 2, otherMinutes: 0, load, lowMin: 0, moderateMin: 0, highMin: 0, kmByZone: [0, 0, 0, 0, 0, 0], zoneMinutes: [0, 0, 0, 0, 0] });
const summary = (acute7d: number, ratio: number, weeks: number[]): LoadSummary => ({ acute7d, chronicWeekly28d: Math.round(acute7d / ratio), ratio, intensity28d: null, weeks: weeks.map(week), runsPerWeek8w: 1.5, runKmPerWeek8w: 15 });

describe("hausse de charge corroborée", () => {
  // 11 semaines complètes autour de 300, puis la semaine en cours.
  const habitual = [280, 310, 0, 300, 290, 320, 300, 0, 305, 295, 300, 200];

  it("ratio 1,6 seul : simple repère, pas de consigne", () => {
    expect(loadAlert(summary(330, 1.6, habitual), { recoveryFlags: [] })).toMatchObject({ ratioHigh: true, actionable: false, reasons: [], typicalWeekLoad: 300 });
  });

  it("ratio 1,6 avec une VFC basse ou un effort perçu de 8/10 : consigne", () => {
    expect(loadAlert(summary(330, 1.6, habitual), { recoveryFlags: ["hrv_low"] }).actionable).toBe(true);
    expect(loadAlert(summary(330, 1.6, habitual), { recoveryFlags: [], perceivedEffort: 8 }).reasons).toEqual(["effort perçu à 8/10"]);
  });

  it("ratio 1,6 et charge absolue nettement au-dessus de l'habitude (× 1,3) : consigne", () => {
    const result = loadAlert(summary(409, 1.6, habitual), { recoveryFlags: [] });
    expect(result.actionable).toBe(true);
    expect(result.reasons).toEqual(["charge inhabituelle sur 12 semaines (semaine médiane 300)"]);
  });
});
