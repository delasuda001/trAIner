import { describe, it, expect } from "vitest";
import {
  selectConfidenceBannerState,
  isAlarmingBanner,
  showsStalenessNote,
  buildThresholdStaleMessage,
} from "./confidence-banner";

describe("selectConfidenceBannerState", () => {
  it("mappe la basse confiance sans tenir compte de la péremption", () => {
    expect(selectConfidenceBannerState({ confidenceLevel: "insufficient", stalePointCount: 3 })).toBe("insufficient");
    expect(selectConfidenceBannerState({ confidenceLevel: "low", stalePointCount: 0 })).toBe("low");
  });

  it("distingue confiance correcte fraîche vs périmée", () => {
    expect(selectConfidenceBannerState({ confidenceLevel: "moderate", stalePointCount: 0 })).toBe("moderate");
    expect(selectConfidenceBannerState({ confidenceLevel: "moderate", stalePointCount: 1 })).toBe("moderate-stale");
    expect(selectConfidenceBannerState({ confidenceLevel: "good", stalePointCount: 0 })).toBe("good");
    expect(selectConfidenceBannerState({ confidenceLevel: "good", stalePointCount: 3 })).toBe("good-stale");
  });
});

describe("isAlarmingBanner / showsStalenessNote", () => {
  it("le bandeau alarmant ne concerne que la basse confiance", () => {
    expect(isAlarmingBanner("insufficient")).toBe(true);
    expect(isAlarmingBanner("low")).toBe(true);
    expect(isAlarmingBanner("good-stale")).toBe(false);
    expect(isAlarmingBanner("moderate-stale")).toBe(false);
    expect(isAlarmingBanner("good")).toBe(false);
  });

  it("la note de péremption neutre n'apparaît que pour les états *-stale", () => {
    expect(showsStalenessNote("good-stale")).toBe(true);
    expect(showsStalenessNote("moderate-stale")).toBe(true);
    expect(showsStalenessNote("good")).toBe(false);
    expect(showsStalenessNote("low")).toBe(false); // porté par le bandeau alarmant
    expect(showsStalenessNote("insufficient")).toBe(false);
  });

  // Scénario du §2 de l'audit : 5 points valides, 3 zones couvertes,
  // 3 points > 8 semaines, confiance "good" -> la note de péremption DOIT
  // apparaître et ne PAS être conditionnée à la confiance.
  it("scénario « confiance bonne + ancrage périmé » : note visible, confiance intacte", () => {
    const state = selectConfidenceBannerState({ confidenceLevel: "good", stalePointCount: 3 });
    expect(state).toBe("good-stale");
    expect(isAlarmingBanner(state)).toBe(false); // pas de bandeau alarmant
    expect(showsStalenessNote(state)).toBe(true); // mais la note neutre s'affiche

    const message = buildThresholdStaleMessage({ validPointCount: 5, stalePointCount: 3, oldestRetainedPointWeeks: 19, windowWeeks: 20 });
    expect(message).not.toBeNull();
    expect(message).toContain("3 des 5 efforts retenus datent de plus de 8 semaines");
    expect(message).toContain("19 semaines");
  });
});

describe("buildThresholdStaleMessage", () => {
  it("null quand aucun point retenu n'est périmé", () => {
    expect(buildThresholdStaleMessage({ validPointCount: 4, stalePointCount: 0, oldestRetainedPointWeeks: 5, windowWeeks: 20 })).toBeNull();
  });

  it("message spécifique quand aucun point n'est retenu", () => {
    expect(buildThresholdStaleMessage({ validPointCount: 0, stalePointCount: 0, oldestRetainedPointWeeks: null, windowWeeks: 20 }))
      .toBe("Aucun effort maximal exploitable dans la fenêtre de 20 semaines.");
  });

  it("tolère un âge inconnu", () => {
    expect(buildThresholdStaleMessage({ validPointCount: 3, stalePointCount: 2, oldestRetainedPointWeeks: null, windowWeeks: 20 }))
      .toBe("2 des 3 efforts retenus datent de plus de 8 semaines.");
  });
});
