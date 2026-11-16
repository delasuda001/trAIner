import { describe, expect, it } from "vitest";
import { parseDeclaredPaceToSpeedMps, resolveDeclaredReferenceSpeedMps } from "./declared-reference";

describe("parseDeclaredPaceToSpeedMps", () => {
  it("reconnaît le format minutes:secondes/km", () => {
    expect(parseDeclaredPaceToSpeedMps("4:00/km")).toBeCloseTo(1000 / 240, 5);
    expect(parseDeclaredPaceToSpeedMps("4:00 min/km")).toBeCloseTo(1000 / 240, 5);
  });

  it("reconnaît le format minutes'secondes/km", () => {
    expect(parseDeclaredPaceToSpeedMps("4'30/km")).toBeCloseTo(1000 / 270, 5);
  });

  it("renvoie null pour un format ambigu plutôt que de deviner une valeur", () => {
    expect(parseDeclaredPaceToSpeedMps("13 km/h")).toBeNull();
    expect(parseDeclaredPaceToSpeedMps("sub-40 sur 10K")).toBeNull();
    expect(parseDeclaredPaceToSpeedMps("rapide")).toBeNull();
    expect(parseDeclaredPaceToSpeedMps("")).toBeNull();
  });

  it("renvoie null pour des secondes invalides", () => {
    expect(parseDeclaredPaceToSpeedMps("4:75/km")).toBeNull();
  });
});

describe("resolveDeclaredReferenceSpeedMps", () => {
  it("renvoie la première référence exploitable", () => {
    const result = resolveDeclaredReferenceSpeedMps([{ value: "rapide" }, { value: "4:00/km" }]);
    expect(result).toBeCloseTo(1000 / 240, 5);
  });

  it("renvoie null sans référence déclarée ou si aucune n’est exploitable", () => {
    expect(resolveDeclaredReferenceSpeedMps(undefined)).toBeNull();
    expect(resolveDeclaredReferenceSpeedMps([])).toBeNull();
    expect(resolveDeclaredReferenceSpeedMps([{ value: "rapide" }])).toBeNull();
  });
});
