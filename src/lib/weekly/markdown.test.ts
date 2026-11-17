import { describe, expect, it } from "vitest";
import { weeklyReviewsMarkdown } from "./markdown";

const review = {
  weekStart: "2026-11-09",
  model: "opus",
  createdAt: "2026-11-16T03:00:00.000Z",
  promptVersion: "weekly-v1",
  output: {
    card: { right: "Les allures cibles", wrong: "La charge citée | mal", change: "Charge avant la séance" },
    items: [{ ref: "Analyse du 13 nov.", kind: "analyse" as const, relevance: 4, actionability: 3, verdict: "Consigne claire et chiffrée." }],
    contradictions: [],
    weaknesses: ["Respect d'allure trop tolérant."],
    candidateRules: [{ rule: "Désactiver l'alerte 1,5 à 1–2 sorties", where: "moteur" as const, evidence: "Semaine du 9 nov." }],
    missingData: [],
  },
};

describe("weeklyReviewsMarkdown", () => {
  it("exporte la carte, les notes, les règles et échappe les barres verticales", () => {
    const markdown = weeklyReviewsMarkdown([review], "2026-11-17T00:00:00.000Z");
    expect(markdown).toContain("## Semaine du 2026-11-09");
    expect(markdown).toContain("| Analyse du 13 nov. | analyse | 4/5 | 3/5 | Consigne claire et chiffrée. |");
    expect(markdown).toContain("**moteur :** Désactiver");
    expect(markdown).not.toContain("### Contradictions");
  });

  it("dit qu'il n'y a rien quand aucun bilan n'existe", () => {
    expect(weeklyReviewsMarkdown([], "2026-11-17T00:00:00.000Z")).toContain("Aucun bilan");
  });
});
