import { describe, expect, it } from "vitest";
import { appendExample, GOAL_EXAMPLES, SESSION_NOTE_EXAMPLES } from "./examples";

describe("exemples cliquables", () => {
  it("ajoute un exemple à la note sans doublon ni dépassement", () => {
    expect(appendExample("", "Vent de face au retour", 600)).toBe("Vent de face au retour");
    expect(appendExample("Mal dormi.", "Vent de face au retour", 600)).toBe("Mal dormi ; Vent de face au retour");
    expect(appendExample("vent de face au retour", "Vent de face au retour", 600)).toBe("vent de face au retour");
    expect(appendExample("x".repeat(295), "Grosse chaleur", 300)).toBe("x".repeat(295));
  });

  it("propose des objectifs de coureur confirmé et ne parle jamais de douleur", () => {
    expect(GOAL_EXAMPLES.some((example) => example.distanceKm === 42.195)).toBe(true);
    expect([...SESSION_NOTE_EXAMPLES, ...GOAL_EXAMPLES.map((example) => example.title)].join(" ").toLowerCase()).not.toMatch(/douleur|blessure|mal au/);
  });
});
