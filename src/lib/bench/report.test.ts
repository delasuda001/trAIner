import { describe, expect, it } from "vitest";
import { resolveJudgement, variantIsA } from "./judge";
import { recommend, type SideStats } from "./report";

const side = (judge: number, tokens: number, guardFailures = 0): SideStats => ({ deterministic: 90, judge, inputTokens: tokens, outputTokens: 0, guardFailures, count: 6 });

describe("recommandation du banc", () => {
  it("adopte une variante aussi bonne et 15 % moins chère", () => {
    expect(recommend(side(3.8, 1000), side(3.75, 850)).recommendation).toBe("adopter");
  });
  it("rejette une variante qui fait échouer le garde-fou", () => {
    expect(recommend(side(3.8, 1000), side(4, 800, 1)).recommendation).toBe("rejeter");
  });
  it("laisse à creuser un écart minime", () => {
    expect(recommend(side(3.8, 1000), side(3.9, 980)).recommendation).toBe("à creuser");
  });
});

describe("étiquettes A/B du juge", () => {
  it("remet les notes dans le bon ordre selon le tirage", () => {
    const fixture = "f1";
    const variantFirst = variantIsA(fixture, "v");
    const high = { exactitude: 5, comparaison: 5, actionnable: 5, ton: 5, concision: 5 };
    const low = { exactitude: 2, comparaison: 2, actionnable: 2, ton: 2, concision: 2 };
    const [verdict] = resolveJudgement({ verdicts: [{ fixture, A: high, B: low, preferred: "A", comment: "A est meilleur." }], overall: "Synthèse de test." }, "v");
    expect(verdict.preferred).toBe(variantFirst ? "variante" : "en place");
    expect(verdict.variant.exactitude).toBe(variantFirst ? 5 : 2);
  });
});
