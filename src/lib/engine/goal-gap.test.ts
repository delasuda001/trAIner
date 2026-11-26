import { describe, expect, it } from "vitest";
import { addDays, startOfIsoWeek } from "@/lib/dates";
import { vouvoyer } from "@/lib/register";
import { completeWeeksAverage, goalGap, nextLongRunKm, primaryGap, type GapRun } from "./goal-gap";

const today = "2026-11-18";
const half = { distanceKm: 21.0975, targetTimeS: 87 * 60 };
const fiveK = { distanceKm: 5, targetTimeS: 19 * 60 };

/** N sorties par semaine sur les 8 semaines complètes avant la semaine en cours, de `km` km, la plus longue à `longest` km. */
function weeks(perWeek: number, km: number, longest = km): GapRun[] {
  const runs: GapRun[] = [];
  for (let week = 0; week < 8; week += 1) for (let index = 0; index < perWeek; index += 1) runs.push({ localDate: addDays(startOfIsoWeek(today), -(week * 7 + index * 2 + 1)), distanceM: km * 1000 });
  runs[0] = { ...runs[0], distanceM: longest * 1000 };
  return runs;
}

describe("moyennes sur semaines complètes", () => {
  it("la semaine en cours ne compte pas : un lundi sans sortie ne fait pas chuter la moyenne, une sortie de la semaine ne la gonfle pas", () => {
    const runs = weeks(2, 10);
    const monday = startOfIsoWeek(today);
    expect(completeWeeksAverage(runs, monday)).toEqual({ runsPerWeek: 2, kmPerWeek: 20, weeks: 7 });
    expect(completeWeeksAverage([...runs, { localDate: today, distanceM: 30_000 }], today)).toEqual({ runsPerWeek: 2, kmPerWeek: 20, weeks: 7 });
    // Le lundi suivant, la semaine qui vient de finir entre dans la moyenne et la plus ancienne en sort.
    expect(completeWeeksAverage([...runs, { localDate: today, distanceM: 30_000 }], addDays(monday, 7)).kmPerWeek).toBeCloseTo((20 * 6 + 30) / 7);
  });

  it("historique de 3 semaines complètes : divisé par 3, pas par 8", () => {
    const monday = startOfIsoWeek(today);
    const recent = [1, 3, 8, 10, 15, 17].map((days) => ({ localDate: addDays(monday, -days), distanceM: 8_000 }));
    expect(completeWeeksAverage(recent, today)).toEqual({ runsPerWeek: 2, kmPerWeek: 16, weeks: 3 });
  });

  it("la plus longue sortie de la semaine en cours compte quand même (un maximum ne se dilue pas)", () => {
    const gap = goalGap({ target: half, runs: [...weeks(3, 10), { localDate: today, distanceM: 16_000 }], today, thresholdSpeedMps: 1000 / 250 });
    expect(gap?.levers.find((lever) => lever.key === "long_run")?.current).toBe("16 km");
  });
});

describe("écart à l'objectif", () => {
  it("allure du moment sur semi : limite dite quand la plus longue sortie est sous 80 % du repère, pas sur 5 km", () => {
    const runs = weeks(2, 7, 11);
    const halfGap = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250 });
    const fiveGap = goalGap({ target: fiveK, runs, today, thresholdSpeedMps: 1000 / 250 });
    expect(halfGap?.paceCaveat).toContain("avec 11 km de plus longue sortie (repère 18 km)");
    expect(fiveGap?.paceCaveat).toBeNull();
    expect(goalGap({ target: half, runs: weeks(2, 7, 16), today, thresholdSpeedMps: 1000 / 250 })?.paceCaveat).toBeNull();
  });

  it("seuil nécessaire : 5 km en 19:00 et semi en 1:27:00 sont des niveaux équivalents, même seuil à ±1 s", () => {
    const runs = weeks(3, 10, 18);
    const fromHalf = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250 })?.levers.find((lever) => lever.key === "threshold");
    const fromFive = goalGap({ target: fiveK, runs, today, thresholdSpeedMps: 1000 / 250 })?.levers.find((lever) => lever.key === "threshold");
    expect(fromHalf?.needed).toBe("4:01/km");
    expect(fromFive?.needed).toBe("4:02/km");
  });

  it("coureur à ~1,5 sortie par semaine : le levier principal est la fréquence, formulé en action chiffrée", () => {
    const runs = weeks(1, 9, 11).concat(weeks(1, 9).filter((_, index) => index % 2 === 0).map((run) => ({ ...run, localDate: addDays(run.localDate, -3) })));
    const gap = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250 });
    if (!gap) throw new Error("attendu");
    expect(gap.main).toBe("frequency");
    expect(gap.action).toBe("Passe à 3 sorties par semaine : ajoute un footing facile de 30 à 40 min en Z2 ; ensuite, allonge ta sortie longue de 2 km toutes les 2 semaines (11 → 18 km en 8 semaines).");
    expect(gap.levers.find((lever) => lever.key === "threshold")).toMatchObject({ current: "4:10/km", needed: "4:01/km", met: false });
    expect(gap.summary).toMatch(/^Levier principal pour le semi : sorties par semaine \(1,6, repère 3 au moins\)\./);
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

describe("sorties possibles déclarées (plafond de l'agenda)", () => {
  it("1,5 sortie par semaine, 2 possibles : on vise 2 (le maximum indiqué), jamais 3, et on le dit", () => {
    const runs = weeks(1, 9, 11).concat(weeks(1, 9).filter((_, index) => index % 2 === 0).map((run) => ({ ...run, localDate: addDays(run.localDate, -3) })));
    const gap = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250, availableRunsPerWeek: 2 });
    if (!gap) throw new Error("attendu");
    expect(gap.nextRunsPerWeek).toBe(2);
    expect(gap.main).toBe("frequency");
    expect(gap.action).toBe("Passe à 2 sorties par semaine (le maximum que tu as indiqué) : ajoute un footing facile de 30 à 40 min en Z2 ; ensuite, allonge ta sortie longue de 2 km toutes les 2 semaines (11 → 18 km en 8 semaines).");
    expect(gap.levers[0]).toMatchObject({ needed: "3 (2 possibles)", capped: true, met: false });
    expect(gap.levers[0].possibleShare).toBeCloseTo(2 / 3, 3);
    expect(gap.availabilityNote).toContain("pour 2 possibles dans ton agenda : le plan n'en ajoute pas");
    expect(vouvoyer(gap.availabilityNote as string)).toContain("pour 2 possibles dans votre agenda : le plan n'en ajoute pas");
    expect(vouvoyer(gap.availabilityNote as string)).not.toMatch(/\b(tu|ton|ta|tes|t')\b/);
    expect(gap.summary).toContain(gap.availabilityNote as string);
    expect(gap.summary).not.toMatch(/Passe à 3/);
  });

  it("déjà à 2 sorties sur 2 possibles : la fréquence n'est plus le levier, le volume vient de la durée des sorties", () => {
    const gap = goalGap({ target: half, runs: weeks(2, 7, 10), today, thresholdSpeedMps: 1000 / 250, availableRunsPerWeek: 2 });
    if (!gap) throw new Error("attendu");
    expect(gap.nextRunsPerWeek).toBe(2);
    expect(gap.main).toBe("volume");
    expect(gap.action).toBe("Avec 2 sorties par semaine, le volume vient de leur durée : allonge ta sortie longue de 2 km toutes les 2 semaines (10 → 18 km en 8 semaines), sans dépasser +1 km par semaine (14 → 40 km/sem).");
    expect(gap.action).not.toMatch(/sorties par semaine :|Passe à/);
  });

  it("assez de sorties possibles : rien ne change (repère de 3, une de plus à la fois)", () => {
    const runs = weeks(1, 9, 11);
    const withAgenda = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250, availableRunsPerWeek: 4 });
    const without = goalGap({ target: half, runs, today, thresholdSpeedMps: 1000 / 250 });
    expect(withAgenda).toEqual(without);
    expect(withAgenda?.availabilityNote).toBeNull();
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

describe("écart qui décide", () => {
  it("l'objectif le plus long au levier structurel, sinon le premier avec un levier", () => {
    const structural = goalGap({ target: half, runs: weeks(1, 9, 11), today, thresholdSpeedMps: 1000 / 250 });
    const fiveKGap = goalGap({ target: fiveK, runs: weeks(1, 9, 11), today, thresholdSpeedMps: 1000 / 250 });
    if (!structural || !fiveKGap) throw new Error("attendu");
    expect(primaryGap([fiveKGap, structural])?.race).toBe("semi");
    const thresholdOnly = goalGap({ target: half, runs: weeks(4, 11, 18), today, thresholdSpeedMps: 1000 / 250 });
    expect(primaryGap(thresholdOnly ? [thresholdOnly] : [])?.main).toBe("threshold");
    expect(primaryGap([])).toBeNull();
  });
});
