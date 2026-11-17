import { describe, expect, it } from "vitest";
import { welcomeHighlights } from "./highlights";

describe("chiffres marquants de l'accueil", () => {
  it("résume les 12 derniers mois, sans les courses plus anciennes", () => {
    const highlights = welcomeHighlights([
      { localDate: "2025-10-01", distanceM: 42_195, movingTimeS: 12_000 },
      { localDate: "2026-03-02", distanceM: 10_000, movingTimeS: 3_000 },
      { localDate: "2026-03-20", distanceM: 21_100, movingTimeS: 6_600 },
      { localDate: "2026-11-15", distanceM: 8_000, movingTimeS: 2_400 },
    ], "2026-11-16");
    expect(highlights).toMatchObject({ runs: 3, km: 39, hours: 3, longestKm: 21.1, activeWeeks: 3, bestMonth: { month: "2026-03", km: 31 } });
  });

  it("ne compte jamais plus de 52 semaines actives", () => {
    const runs = Array.from({ length: 366 }, (_, day) => ({ localDate: new Date(Date.UTC(2026, 10, 16) - day * 86_400_000).toISOString().slice(0, 10), distanceM: 5_000, movingTimeS: 1_500 }));
    expect(welcomeHighlights(runs, "2026-11-16").activeWeeks).toBe(52);
  });

  it("reste lisible sans aucune course", () => {
    expect(welcomeHighlights([], "2026-11-16")).toMatchObject({ runs: 0, km: 0, longestKm: null, bestMonth: null });
  });
});
