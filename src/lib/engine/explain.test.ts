import { describe, expect, it } from "vitest";
import { progressionVerdict } from "./explain";
import type { Progression } from "./progression";

function progression(overrides: Partial<Progression>): Progression {
  const period = { start: "2026-10-01", end: "2026-11-15", runs: 4, speedAtReferenceHr: 1000 / 340, aerobicMinutes: 120, runKmPerWeek: 15 };
  return {
    state: "stable", confidence: "moderate", referenceHeartRateBpm: 140, windowWeeks: 6,
    recent: period, previous: period, paceGainSPerKm: 3, changePct: 0.9, runToRunSpreadSPerKm: 8,
    vo2max: { latest: null, weeksAgo: null, delta: null }, points: [], caveats: [],
    ...overrides,
  };
}

describe("progressionVerdict", () => {
  it("stable : le verdict d'abord, l'écart comparé à la variation normale", () => {
    const verdict = progressionVerdict(progression({}));
    expect(verdict.headline).toBe("C'est stable");
    expect(verdict.tone).toBe("neutral");
    expect(verdict.reason).toBe("3 s/km d'écart avec les 6 semaines d'avant, bien moins que ta variation habituelle d'une sortie à l'autre.");
  });

  it("stable mais écart au-dessus de la variation : pas de « moins que »", () => {
    expect(progressionVerdict(progression({ paceGainSPerKm: 5, runToRunSpreadSPerKm: 4 })).reason).toBe("5 s/km d'écart avec les 6 semaines d'avant, trop peu pour parler d'un changement.");
  });

  it("stable sans écart mesurable", () => {
    expect(progressionVerdict(progression({ paceGainSPerKm: 0 })).reason).toBe("Même allure qu'il y a 6 semaines.");
  });

  it("progression : plus vite à la même FC, en s/km", () => {
    const verdict = progressionVerdict(progression({ state: "progressing", paceGainSPerKm: 12, confidence: "high" }));
    expect(verdict).toEqual({ headline: "Ça progresse", tone: "good", reason: "12 s/km plus vite qu'il y a 6 semaines, à cœur égal.", caution: null });
  });

  it("recul : plus lent, signalé à confirmer si peu de sorties", () => {
    const verdict = progressionVerdict(progression({ state: "regressing", paceGainSPerKm: -9, confidence: "low" }));
    expect(verdict.headline).toBe("Ça recule");
    expect(verdict.reason).toBe("9 s/km plus lent qu'il y a 6 semaines, à cœur égal.");
    expect(verdict.caution).not.toBeNull();
  });

  it("pas de tendance : dit combien de sorties manquent", () => {
    const verdict = progressionVerdict(progression({ state: "insufficient", windowWeeks: 8, recent: { ...progression({}).recent, runs: 1 }, paceGainSPerKm: null }));
    expect(verdict.headline).toBe("Pas encore de tendance");
    expect(verdict.reason).toContain("il en manque 2");
  });
});
