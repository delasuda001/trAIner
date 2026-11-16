import { describe, expect, it } from "vitest";
import type { FeedbackRecord } from "@/lib/profiles/registry";
import { digestFeedback, digestMarkdown, screenOf } from "./digest";

function record(overrides: Partial<FeedbackRecord>): FeedbackRecord {
  return { id: Math.random().toString(36), profileId: "papa", createdAt: "2026-11-20T10:00:00Z", page: "/", category: "idee", rating: null, subjectKind: null, subjectId: null, promptVersion: null, note: "", ...overrides };
}

describe("consolidation des retours", () => {
  const records = [
    record({ category: "besoin", page: "/", note: "Voir mon volume par mois" }),
    record({ category: "besoin", page: "/", profileId: "frere", note: "Comparer à l'an dernier" }),
    record({ category: "bug", page: "/activities/garmin:1", note: "Le graphe déborde" }),
    record({ category: "analyse", page: "/activities/garmin:1", rating: -1, subjectKind: "session", subjectId: "garmin:1", promptVersion: "session-v12", note: "Trop vague sur l'allure" }),
    record({ category: "analyse", page: "/", rating: 1, subjectKind: "outlook", subjectId: "x", note: "" }),
    record({ category: "analyse", page: "/activities/garmin:2", rating: 1, subjectKind: "session", subjectId: "garmin:2", promptVersion: "session-v12", note: "" }),
  ];
  const digest = digestFeedback(records);

  it("regroupe les notes par thème, besoins d'abord, et compte les pouces par type", () => {
    expect(digest.total).toBe(6);
    expect(digest.notes).toBe(4);
    expect(digest.themes[0]).toMatchObject({ category: "besoin", screen: "Tableau de bord" });
    expect(digest.themes[0].entries).toHaveLength(2);
    expect(digest.ratings.find((stat) => stat.subjectKind === "session")).toMatchObject({ up: 1, down: 1, byPrompt: [{ promptVersion: "session-v12", up: 1, down: 1 }] });
    expect(digest.byProfile[0]).toEqual({ profileId: "papa", count: 5 });
  });

  it("exporte en Markdown avec les prénoms, jamais les identifiants internes", () => {
    const markdown = digestMarkdown(digest, new Map([["papa", "Papa"], ["frere", "Frère"]]), "2026-11-21T08:00:00Z");
    expect(markdown).toContain("# Retours des testeurs de Sillage (2026-11-21)");
    expect(markdown).toContain("## Besoins");
    expect(markdown).toContain("- Frère, 2026-11-20 : Comparer à l'an dernier");
    expect(markdown).toContain("Analyses de séance : 1 utile(s), 1 pas utile(s) (session-v12 1/1)");
    expect(markdown).toContain("👎 : Trop vague");
  });

  it("nomme les écrans", () => {
    expect(screenOf("/activities/garmin:9")).toBe("Séance");
    expect(screenOf("/coach")).toBe("Demander au coach");
  });
});
