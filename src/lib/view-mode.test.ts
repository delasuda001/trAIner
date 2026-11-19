import { describe, expect, it } from "vitest";
import { defaultViewMode, resolveViewMode } from "./view-mode";

describe("vue du tableau de bord", () => {
  it("essentiel par défaut pour un invité, complète pour Bastien", () => {
    expect(defaultViewMode("guest")).toBe("essential");
    expect(defaultViewMode("admin")).toBe("full");
  });

  it("le réglage du profil l'emporte ; « Voir le détail » ouvre la vue complète sans le changer", () => {
    expect(resolveViewMode("full", "guest")).toBe("full");
    expect(resolveViewMode("essential", "admin")).toBe("essential");
    expect(resolveViewMode(null, "guest", "complete")).toBe("full");
    expect(resolveViewMode(null, "admin", null)).toBe("full");
  });
});
