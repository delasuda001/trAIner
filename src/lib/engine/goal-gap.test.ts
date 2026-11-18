import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { vouvoyer } from "@/lib/register";
import { goalGap, nextLongRunKm, type GapRun } from "./goal-gap";

const today = "2026-11-18";
const half = { distanceKm: 21.0975, targetTimeS: 87 * 60 };
const fiveK = { distanceKm: 5, targetTimeS: 19 * 60 };

/** N sorties par semaine sur 8 semaines, de `km` km, la plus longue à `longest` km. */
function weeks(perWeek: number, km: number, longest = km): GapRun[] {
  const runs: GapRun[] = [];
  for (let week = 0; week < 8; week += 1) for (let index = 0; index < perWeek; index += 1) runs.push({ localDate: addDays(today, -(week * 7 + index * 2 + 1)), distanceM: km * 1000 });
  runs[0] = { ...runs[0], distanceM: longest * 1000 };
  return runs;
}

describe("écart à l'objectif", () => {
  it("coureur à ~1,5 sortie par semaine : le levier principal est la fréquence, formulé en action chiffrée", () => {
    const runs = weeks(1, 9, 11).concat(weeks(1, 9).filter((_, index) => index % 2 === 0).map((run) => ({ ...run, localDate: addDays(run.localDate, -3) })));
    const gap = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250 });
    if (!gap) throw new Error("attendu");
    expect(gap.main).toBe("frequency");
    expect(gap.action).toBe("Passe à 3 sorties par semaine : ajoute un footing facile de 30 à 40 min en Z2 ; ensuite, allonge ta sortie longue de 2 km toutes les 2 semaines (11 → 18 km en 8 semaines).");
    expect(gap.levers.find((lever) => lever.key === "threshold")).toMatchObject({ current: "4:10/km", needed: "4:01/km", met: false });
    expect(gap.summary).toMatch(/^Levier principal pour le semi : sorties par semaine \(1,5, repère 3 au moins\)\./);
  });

  it("fréquence et volume au niveau : la sortie longue passe en tête", () => {
    const gap = goalGap({ target: half, runs: weeks(4, 11, 13), today, thresholdSpeedMps: 1000 / 250 });
    expect(gap?.main).toBe("long_run");
    expect(gap?.action).toBe("Allonge ta sortie longue de 2 km toutes les 2 semaines (13 → 18 km en 6 semaines), en Z2.");
  });

  it("structure au niveau : le seuil devient le levier", () => {
    const gap = goalGap({ target: half, runs: weeks(4, 11, 18), today, thresholdSpeedMps: 1000 / 250 });
    expect(gap?.main).toBe("threshold");
    expect(gap?.action).toContain("à 4:10/km, en visant 4:01/km");
  });

  it("tout au niveau : pas d'action, une phrase de maintien", () => {
    const gap = goalGap({ target: fiveK, runs: weeks(4, 8, 12), today, thresholdSpeedMps: 1000 / 240 });
    expect(gap?.main).toBeNull();
    expect(gap?.summary).toContain("au niveau des repères");
  });

  it("prévient quand la date de course laisse trop peu de temps pour la sortie longue", () => {
    const runs = weeks(1, 9, 11).concat(weeks(1, 9).map((run) => ({ ...run, localDate: addDays(run.localDate, -3) })));
    const gap = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250, eventDate: addDays(today, 42) });
    expect(gap?.summary).toContain("Course dans 6 semaines : c'est juste pour tout construire.");
  });

  it("distance sans repère : pas d'écart calculé", () => {
    expect(goalGap({ target: { distanceKm: 15, targetTimeS: 3600 }, runs: [], today, thresholdSpeedMps: null })).toBeNull();
  });

  it("une sortie de plus à la fois (1 → 2), et se vouvoie proprement pour un invité", () => {
    const runs = weeks(1, 9, 11);
    const gap = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250 });
    expect(vouvoyer(gap?.action ?? "")).toBe("Passez à 2 sorties par semaine : ajoutez un footing facile de 30 à 40 min en Z2 ; ensuite, allongez votre sortie longue de 2 km toutes les 2 semaines (11 → 18 km en 8 semaines).");
  });
});

describe("prochaine sortie longue", () => {
  it("+2 km quand la plus longue a été tenue deux fois en 4 semaines, sinon on consolide ; jamais au-delà du repère", () => {
    const held = [{ localDate: addDays(today, -4), distanceM: 11000 }, { localDate: addDays(today, -18), distanceM: 10400 }];
    expect(nextLongRunKm(held, today, 18)).toEqual({ km: 13, step: true, longestKm: 11 });
    expect(nextLongRunKm([{ localDate: addDays(today, -4), distanceM: 11000 }, { localDate: addDays(today, -18), distanceM: 9000 }], today, 18)).toMatchObject({ km: 11, step: false });
    expect(nextLongRunKm([{ localDate: addDays(today, -4), distanceM: 17500 }, { localDate: addDays(today, -11), distanceM: 17200 }], today, 18)).toMatchObject({ km: 18 });
  });
});
