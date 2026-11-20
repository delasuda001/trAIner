import { describe, expect, it } from "vitest";
import { buildReviewPrompt, REVIEW_MODEL, REVIEW_SYSTEM_PROMPT, reviewSchema } from "./quality-review";

describe("relecteur indépendant", () => {
  it("modèle économe, rôle de second avis, jamais le prompt du coach", () => {
    expect(REVIEW_MODEL).toBe("haiku");
    expect(REVIEW_SYSTEM_PROMPT).toContain("second avis indépendant");
    expect(REVIEW_SYSTEM_PROMPT).toContain("Tu n'as pas écrit ces textes");
  });

  it("valide une sortie conforme et refuse une catégorie inconnue", () => {
    const ok = { findings: [{ case_id: "garmin:1", severity: "error", category: "faux", quote: "64 ms, sous votre plage", issue: "64 ms est dans la plage 60–76 ms.", rule_idea: "Vérifier toute comparaison à une plage citée." }], summary: "" };
    expect(reviewSchema.safeParse(ok).success).toBe(true);
    expect(reviewSchema.safeParse({ ...ok, findings: [{ ...ok.findings[0], category: "autre" }] }).success).toBe(false);
  });

  it("le dossier part tel quel, sans clé de position GPS", () => {
    const prompt = buildReviewPrompt({ coureur: { niveau: "confirmed" }, cas: [{ id: "a", type: "séance", faits: { seance: { distance: "10 km" } }, texte_affiche: ["Bien."] }] });
    expect(prompt).toContain("\"niveau\":\"confirmed\"");
    expect(prompt).not.toMatch(/latitude|longitude|"lat"|"lon"/);
  });
});
