import { describe, expect, it } from "vitest";
import { displayFirstName, frenchSpacing, shouldShowTour, tourAllowedOn, tourSeenKey, tourSteps } from "./tour";

describe("visite guidée", () => {
  it("s'ouvre si jamais vue, ou vue avant une réinitialisation de l'accueil", () => {
    expect(shouldShowTour(null, null)).toBe(true);
    expect(shouldShowTour(null, "2026-11-20T10:00:00.000Z")).toBe(true);
    expect(shouldShowTour("2026-11-21T10:00:00.000Z", null)).toBe(false);
    expect(shouldShowTour("2026-11-19T10:00:00.000Z", "2026-11-20T10:00:00.000Z")).toBe(true);
    expect(shouldShowTour("2026-11-21T10:00:00.000Z", "2026-11-20T10:00:00.000Z")).toBe(false);
  });

  it("une clé par profil", () => {
    expect(tourSeenKey("benoit")).toBe("tour_seen_benoit");
  });

  it("jamais d'office sur la connexion ni l'accueil du testeur", () => {
    expect(tourAllowedOn("/")).toBe(true);
    expect(tourAllowedOn("/coach")).toBe(true);
    expect(tourAllowedOn("/parametres")).toBe(true);
    expect(tourAllowedOn("/connexion")).toBe(false);
    expect(tourAllowedOn("/connexion/invitation")).toBe(false);
    expect(tourAllowedOn("/bienvenue")).toBe(false);
    expect(tourAllowedOn("/bienvenues")).toBe(true);
  });

  it("espaces insécables à la française", () => {
    expect(frenchSpacing("Un doute ? Le bouton « Un retour ? » : ici")).toBe("Un doute\u00a0? Le bouton «\u00a0Un retour\u00a0?\u00a0»\u00a0: ici");
  });

  it("prénom en capitale", () => {
    expect(displayFirstName("benoît")).toBe("Benoît");
    expect(displayFirstName("Marie Claire")).toBe("Marie");
    expect(displayFirstName("  ")).toBe("");
  });

  it("présente l'accueil, le coach et l'objectif, au tutoiement", () => {
    const steps = tourSteps("Benoît", true);
    expect(steps.map((step) => step.tab)).toEqual([null, "/", "/coach", "/objectif", null]);
    expect(steps[0].title).toBe("Bienvenue, Benoît.");
    const text = steps.flatMap((step) => [step.title, step.lead, ...step.points]).join(" ");
    expect(text).not.toMatch(/\b(vous|votre|vos)\b/i);
    expect(text).toContain("abonnement de Bastien");
    expect(tourSteps("Bastien", false).flatMap((step) => step.points).join(" ")).not.toContain("abonnement de Bastien");
  });

  it("textes courts, lisibles sur un téléphone", () => {
    for (const step of tourSteps("Benoît", true)) {
      expect(step.title.length).toBeLessThanOrEqual(48);
      expect(step.lead.length).toBeLessThanOrEqual(170);
      for (const point of step.points) expect(point.length).toBeLessThanOrEqual(100);
    }
  });
});
