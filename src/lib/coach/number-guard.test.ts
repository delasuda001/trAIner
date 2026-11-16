import { describe, expect, it } from "vitest";
import { allowedNumbers, findUnsupportedNumbers } from "./number-guard";

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
