import { describe, expect, it } from "vitest";
import { goalSchema, inferRaceTarget, withInferredTarget } from "./goal";

describe("objectif chiffré lu dans le titre", () => {
  it.each([
    ["10km sous 50 min", 10, 3000],
    ["10 km en 55:00", 10, 3300],
    ["Courir un 10K en 49'", 10, 2940],
    ["Semi en 1h45", 21.0975, 6300],
    ["semi-marathon sous 1:52:30", 21.0975, 6750],
    ["Marathon en 3h30", 42.195, 12600],
    ["5 km en 24:30", 5, 1470],
  ])("%s", (title, distanceKm, targetTimeS) => {
    expect(inferRaceTarget(title)).toEqual({ distanceKm, targetTimeS });
  });

  it.each(["Courir plus régulièrement", "Finir un 10 km", "10 km sous 5 min", "Trail de 30 km"])("rien de chiffré ou d'invraisemblable : %s", (title) => {
    expect(inferRaceTarget(title)).toBeNull();
  });

  it("complète l'objectif pour le moteur sans toucher à un objectif déjà chiffré", () => {
    const fromTitle = withInferredTarget(goalSchema.parse({ title: "10km sous 50 min", runsPerWeek: 3 }));
    expect(fromTitle).toMatchObject({ distanceKm: 10, targetTimeS: 3000, raceTargets: [{ distanceKm: 10, targetTimeS: 3000 }] });
    const fromFields = withInferredTarget(goalSchema.parse({ title: "Mon semi", distanceKm: 21.0975, targetTimeS: 6300 }));
    expect(fromFields.raceTargets).toEqual([{ distanceKm: 21.0975, targetTimeS: 6300 }]);
    const set = goalSchema.parse({ title: "10km sous 50 min", raceTargets: [{ distanceKm: 5, targetTimeS: 1140 }] });
    expect(withInferredTarget(set)).toBe(set);
  });
});
