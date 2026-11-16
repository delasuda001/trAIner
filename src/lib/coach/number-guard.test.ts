import { describe, expect, it } from "vitest";
import { allowedNumbers, findUnsupportedNumbers, findZoneContradictions } from "./number-guard";

describe("garde-fou des chiffres", () => {
  const payload = { allure: "4:10/km", fc: "168 bpm", ecart: "1,5 %", seances: [{ duree: "47:52" }], derive: "3,4 %" };
  const allowed = allowedNumbers(payload);

  it("accepte les chiffres présents, y compris arrondis", () => {
    expect(findUnsupportedNumbers("Répétitions à 4:10/km, 168 bpm, écart de 1,5 % puis 3 % de dérive, en 47:52.", allowed)).toEqual([]);
  });

  it("tolère les petits entiers de comptage", () => {
    expect(findUnsupportedNumbers("3 répétitions, 2e moitié, zone 4", allowed)).toEqual([]);
  });

  it("signale une allure ou une FC inventée", () => {
    expect(findUnsupportedNumbers("Vise 4:05/km à 172 bpm", allowed)).toEqual(["4:05", "172"]);
  });
});

describe("garde-fou des zones", () => {
  const zoneOf = (hr: number) => (hr >= 167 ? 5 : hr >= 159 ? 4 : hr >= 149 ? 3 : hr >= 128 ? 2 : 1);
  it("accepte une zone cohérente", () => {
    expect(findZoneContradictions("Répétition à 168 bpm (Z5), puis 165 bpm en Z4.", zoneOf)).toEqual([]);
  });
  it("rejette 165 bpm présenté en Z5", () => {
    expect(findZoneContradictions("La #1 à 165 bpm démarre déjà en Z5.", zoneOf)).toEqual(["165 bpm n'est pas en Z5"]);
  });
  it("accepte une FC dans une plage de zones", () => {
    expect(findZoneContradictions("Cible 149–166 bpm (Z3–Z4).", zoneOf)).toEqual([]);
    expect(findZoneContradictions("Cible 170 bpm (Z3–Z4).", zoneOf)).toEqual(["170 bpm n'est pas en Z3–Z4"]);
  });
});
