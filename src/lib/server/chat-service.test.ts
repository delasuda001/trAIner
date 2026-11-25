import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("tableau de bord à la demande", () => {
  it("part avec les questions sur l'objectif, les jauges ou le plan, pas avec les autres", async () => {
    const { wantsDashboard } = await import("./chat-service");
    expect(wantsDashboard("Où j'en suis de mon objectif semi ?")).toBe(true);
    expect(wantsDashboard("Que disent mes jauges ?")).toBe(true);
    expect(wantsDashboard("Ta reco pour samedi ?")).toBe(true);
    expect(wantsDashboard("J'ai eu mal aux jambes hier soir, normal ?")).toBe(false);
    expect(wantsDashboard("Pourquoi mes répétitions étaient plus lentes ?")).toBe(false);
  });
});
