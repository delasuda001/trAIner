import { describe, expect, it } from "vitest";
import { addDays, chunkDateRange, daysBetween, startOfIsoWeek } from ".";

describe("dates civiles", () => {
  it("additionne et compte les jours sans dépendre du fuseau", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-11-01", "2026-11-15")).toBe(14);
  });
  it("découpe une plage en fenêtres acceptées par l'API", () => {
    expect(chunkDateRange("2026-01-01", "2026-03-01", 28)).toEqual([["2026-01-01", "2026-01-28"], ["2026-01-29", "2026-02-25"], ["2026-02-26", "2026-03-01"]]);
  });
  it("trouve le lundi de la semaine", () => {
    expect(startOfIsoWeek("2026-11-15")).toBe("2026-11-09");
    expect(startOfIsoWeek("2026-11-09")).toBe("2026-11-09");
  });
});
