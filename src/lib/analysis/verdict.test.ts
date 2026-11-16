import { describe, expect, it } from "vitest";
import { classifySessionVerdict, type VerdictInput } from "./verdict";
import type { RegularityAssessment } from "./regularity";
import type { VariationProfile } from "./variation-profile";

function regularity(overrides: Partial<RegularityAssessment> = {}): RegularityAssessment {
  return {
    analyzedSegmentCount: 4,
    paceCoefficientOfVariation: 0.01,
    firstHalfAverageSpeedMps: 4.0,
    secondHalfAverageSpeedMps: 4.0,
    secondHalfSlowdownPct: 0,
    firstVsLastSlowdownPct: 0,
    basis: "work_segments",
    ...overrides,
  };
}

function profile(overrides: Partial<VariationProfile> = {}): VariationProfile {
  return { label: "steady", confidence: "high", hasRecoveryOrWalkSegments: false, ...overrides };
}

function input(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    regularity: regularity(),
    variationProfile: profile(),
    sessionIntent: null,
    historicalComparison: null,
    thresholdConfidence: "good",
    ...overrides,
  };
}

describe("classifySessionVerdict", () => {
  it("1. séance homogène à répétitions régulières -> well_executed", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: 0.5, paceCoefficientOfVariation: 0.02 }),
      variationProfile: profile({ label: "intervalled", confidence: "high" }),
    }));
    expect(result.verdict).toBe("well_executed");
  });

  it("2. fartlek avec alternance volontaire détectée -> jamais miscalibrated, même avec une dégradation mesurée", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: 8 }), // dégradation significative
      variationProfile: profile({ label: "fartlek_like", confidence: "moderate" }),
      sessionIntent: null, // pas d'intention déclarée : seule la structure détectée protège
    }));
    expect(result.verdict).not.toBe("miscalibrated");
  });

  it("3. sortie progressive -> well_executed", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: -6, basis: "full_session" }), // 2e moitié plus rapide
      variationProfile: profile({ label: "progressive", confidence: "high" }),
    }));
    expect(result.verdict).toBe("well_executed");
  });

  it("4. accélération finale (technical_variation_possible) -> jamais de faux miscalibrated", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: -10 }), // le kick final rend la 2e moitié plus rapide
      variationProfile: profile({ label: "technical_variation_possible", confidence: "moderate" }),
    }));
    expect(result.verdict).not.toBe("miscalibrated");
    // Décision finale B : ce signal ne doit jamais être cité comme une preuve affirmative de travail technique.
    expect(result.verdictEvidence.some((item) => item.label.toLowerCase().includes("gammes"))).toBe(false);
  });

  it("5. séance de cadence déclarée, sans dégradation réelle -> pas de miscalibrated déclenché par la seule déclaration", () => {
    const result = classifySessionVerdict(input({
      sessionIntent: "cadence_technique",
      regularity: regularity({ secondHalfSlowdownPct: 1 }),
      variationProfile: profile({ label: "technical_variation_possible", confidence: "moderate" }),
    }));
    expect(result.verdict).not.toBe("miscalibrated");
  });

  it("6. séance irrégulière sans intention ni structure fiable -> partly_successful au plus, jamais miscalibrated", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: 9 }),
      variationProfile: profile({ label: "unknown", confidence: "low" }),
      sessionIntent: null,
    }));
    expect(result.verdict).toBe("partly_successful");
  });

  it("7. récupération marchée/trottée présente sans polluer un verdict par ailleurs favorable", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: 0.2, paceCoefficientOfVariation: 0.03 }),
      variationProfile: profile({ label: "intervalled", confidence: "high", hasRecoveryOrWalkSegments: true }),
    }));
    expect(result.verdict).toBe("well_executed");
  });

  it("8. variation explicitement déclarée ET cohérente avec la structure détectée -> jamais miscalibrated", () => {
    const result = classifySessionVerdict(input({
      sessionIntent: "fartlek",
      regularity: regularity({ secondHalfSlowdownPct: 1 }),
      variationProfile: profile({ label: "fartlek_like", confidence: "moderate" }),
    }));
    expect(result.verdict).not.toBe("miscalibrated");
  });

  it("miscalibrated exige une intention explicitement déclarée ET contredite par les données (Décision finale A)", () => {
    const withoutIntent = classifySessionVerdict(input({
      regularity: regularity({ secondHalfSlowdownPct: 9 }),
      variationProfile: profile({ label: "steady", confidence: "high" }), // structure inférée à haute confiance, mais pas déclarée
    }));
    expect(withoutIntent.verdict).not.toBe("miscalibrated");

    const withIntent = classifySessionVerdict(input({
      sessionIntent: "sortie_longue",
      regularity: regularity({ secondHalfSlowdownPct: 9 }),
      variationProfile: profile({ label: "steady", confidence: "high" }),
    }));
    expect(withIntent.verdict).toBe("miscalibrated");
    expect(withIntent.verdictEvidence.some((item) => item.metric === "declared_intent_contradiction")).toBe(true);
  });

  it("libre/autre sont trop peu spécifiques pour établir une contradiction", () => {
    const result = classifySessionVerdict(input({
      sessionIntent: "libre",
      regularity: regularity({ secondHalfSlowdownPct: 9 }),
    }));
    expect(result.verdict).not.toBe("miscalibrated");
  });

  it("not_evaluable quand ni régularité ni comparaison historique ni seuil ne sont exploitables", () => {
    const result = classifySessionVerdict(input({
      regularity: regularity({ basis: "insufficient", secondHalfSlowdownPct: null, paceCoefficientOfVariation: null }),
      historicalComparison: null,
      thresholdConfidence: "insufficient",
    }));
    expect(result.verdict).toBe("not_evaluable");
    expect(result.verdictEvidence).toHaveLength(1);
  });

  it("verdictEvidence n'est jamais vide", () => {
    const result = classifySessionVerdict(input());
    expect(result.verdictEvidence.length).toBeGreaterThan(0);
  });
});
