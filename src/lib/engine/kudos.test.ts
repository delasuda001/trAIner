import { describe, expect, it } from "vitest";
import { isHardSession, sessionKudos, type KudosRun } from "./kudos";

const base: KudosRun = { id: "a1", localDate: "2026-11-24", kind: "endurance", title: "Endurance", distanceM: 10_000, movingTimeS: 3_300, aerobicTrainingEffect: 2.8, perceivedEffort: null };

describe("félicitations après une séance difficile", () => {
  it("qualité, longue, effet aérobie ≥ 4 ou effort perçu ≥ 8 : difficile ; footing tranquille : non", () => {
    expect(isHardSession(base)).toBe(false);
    expect(isHardSession({ ...base, kind: "intervals_short" })).toBe(true);
    expect(isHardSession({ ...base, movingTimeS: 95 * 60 })).toBe(true);
    expect(isHardSession({ ...base, aerobicTrainingEffect: 4.1 })).toBe(true);
    expect(isHardSession({ ...base, perceivedEffort: 8 })).toBe(true);
  });

  it("une seule fois par séance, et seulement dans les 3 jours", () => {
    const hard = { ...base, kind: "intervals_threshold" as const, title: "Fractionné long 3 × 2 km" };
    expect(sessionKudos(hard, "2026-11-25", null)).toMatchObject({ id: "a1", headline: "Séance de qualité bouclée. Bravo." });
    expect(sessionKudos(hard, "2026-11-25", null)?.detail).toContain("hier");
    expect(sessionKudos(hard, "2026-11-25", "a1")).toBeNull();
    expect(sessionKudos(hard, "2026-11-28", null)).toBeNull();
  });
});
