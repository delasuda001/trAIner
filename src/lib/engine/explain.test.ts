import { describe, expect, it } from "vitest";
import { progressionAction, progressionExplanation, progressionVerdict } from "./explain";
import type { GoalGap } from "./goal-gap";
import { vouvoyer } from "@/lib/register";
import type { Progression } from "./progression";

function progression(overrides: Partial<Progression>): Progression {
  const period = { start: "2026-10-01", end: "2026-11-15", runs: 4, speedAtReferenceHr: 1000 / 340, aerobicMinutes: 120, runKmPerWeek: 15 };
  return {
    state: "stable", confidence: "moderate", referenceHeartRateBpm: 140, referenceSource: "watch_z2", windowWeeks: 6,
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
    expect(verdict.headline).toBe("Pas assez de données");
    expect(verdict.reason).toContain("il en manque 2");
  });
});

function gap(main: GoalGap["main"], race = "semi"): GoalGap {
  return { race, levers: [], main, action: null, summary: "", nextRunsPerWeek: 3, goalPaceS: 247, distanceKm: 21.0975, targetTimeS: 5220 };
}

describe("progressionAction", () => {
  it("stable : une phrase reliée au levier de l'objectif, sans marge chiffrée", () => {
    const text = progressionAction(progression({}), [gap("frequency")]);
    expect(text).toBe("Pour la faire progresser vers ton semi : ajoute un footing facile en Z2 pour passer à 3 sorties par semaine.");
    expect(text).not.toMatch(/±|s\/km/);
  });

  it("progression : continuer, avec le prochain pas du levier", () => {
    expect(progressionAction(progression({ state: "progressing" }), [gap("long_run")])).toBe("Continue sur cette lancée ; pour ton semi, le prochain pas : allonge ta sortie longue de 2 km toutes les 2 semaines, en Z2.");
  });

  it("plusieurs objectifs au même levier : « tes objectifs »", () => {
    expect(progressionAction(progression({}), [gap("frequency", "5 km"), gap("frequency")])).toBe("Pour la faire progresser vers tes objectifs : ajoute un footing facile en Z2 pour passer à 3 sorties par semaine.");
  });

  it("recul et pas de données : une action, jamais un diagnostic", () => {
    expect(progressionAction(progression({ state: "regressing" }), [])).toBe("Pour la relancer : garde des footings réguliers et vraiment faciles.");
    const insufficient = progressionAction(progression({ state: "insufficient", recent: { ...progression({}).recent, runs: 1 } }), [gap("frequency")]);
    expect(insufficient).toContain("il en faut 2 de plus");
  });

  it("se vouvoie proprement pour un invité", () => {
    expect(vouvoyer(progressionAction(progression({ state: "progressing" }), [gap("frequency")]))).toBe("Continuez sur cette lancée ; pour votre semi, le prochain pas : ajoutez un footing facile en Z2 pour passer à 3 sorties par semaine.");
    expect(vouvoyer("ton allure quand tu cours à 138 bpm")).toBe("votre allure quand vous courez à 138 bpm");
  });
});

describe("progressionExplanation", () => {
  it("dit d'où vient la FC de référence, puis l'écart mesuré", () => {
    const text = progressionExplanation(progression({}));
    expect(text).toContain("ramenée à 140 bpm (le milieu de ta zone 2, selon ta montre)");
    expect(text).toContain("bien moins que ta variation habituelle");
  });
});
