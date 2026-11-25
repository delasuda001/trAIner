import { addDays, daysBetween, startOfIsoWeek } from "@/lib/dates";
import { formatPace } from "@/lib/formatters";
import { paceSeconds } from "./activity-metrics";
import { RACE_RATIO_FROM_THRESHOLD, type RaceTarget } from "./prescription";

/**
 * Écart à l'objectif : ce qui sépare le coureur de son temps visé, levier par
 * levier, et LE levier à travailler d'abord, formulé comme une action chiffrée.
 *
 * Repères d'entraîneur courants (pas des normes) selon la distance :
 * - sorties par semaine : 3 au moins pour progresser sur 5 km comme sur semi ;
 * - volume hebdomadaire et plus longue sortie : ordre de grandeur des plans
 *   usuels pour le niveau visé ;
 * - seuil : allure au seuil qu'implique le temps visé (mêmes ratios que les
 *   estimations d'allure de course).
 * Fréquence et volume : moyennes des 8 dernières semaines COMPLÈTES (lundi–dimanche), la
 * semaine en cours exclue (sinon un lundi ferait chuter la moyenne). La plus longue sortie se
 * lit sur les 8 semaines glissantes, semaine en cours comprise (un maximum ne se dilue pas).
 */

export const GAP_WINDOW_WEEKS = 8;
/** Sortie longue : +2 km toutes les 2 semaines (progression prudente). */
const LONG_STEP_KM = 2;
const LONG_STEP_WEEKS = 2;
/** Volume : +10 % par semaine au plus. */
const VOLUME_WEEKLY_GROWTH = 0.1;
/** Un levier à moins de 70 % du repère passe avant le seuil. */
const STRUCTURAL_SHORTFALL = 0.7;
/** Écart de seuil (s/km) en deçà duquel le seuil n'est pas un levier. */
const THRESHOLD_MARGIN_S = 3;

type Benchmarks = { race: string; runsPerWeek: number; weeklyKm: number; longRunKm: number };

function benchmarks(distanceKm: number, goalPaceS: number): Benchmarks | null {
  if (Math.abs(distanceKm - 5) < 0.05) return { race: "5 km", runsPerWeek: 3, weeklyKm: goalPaceS < 240 ? 30 : 20, longRunKm: 12 };
  if (Math.abs(distanceKm - 10) < 0.05) return { race: "10 km", runsPerWeek: 3, weeklyKm: goalPaceS < 250 ? 35 : 25, longRunKm: 14 };
  if (Math.abs(distanceKm - 21.0975) < 0.05) return { race: "semi", runsPerWeek: 3, weeklyKm: goalPaceS < 270 ? 40 : 30, longRunKm: 18 };
  if (Math.abs(distanceKm - 42.195) < 0.05) return { race: "marathon", runsPerWeek: 4, weeklyKm: goalPaceS < 300 ? 60 : 45, longRunKm: 30 };
  return null;
}

export type GapRun = { localDate: string; distanceM: number | null; /** Effort de course (cf. isRaceLikeEffort) : pas un repère de sortie longue à l'entraînement. */ raceLike?: boolean };

export type GoalLever = {
  key: "frequency" | "volume" | "long_run" | "threshold";
  label: string;
  current: string;
  needed: string;
  /** Part du repère atteinte (1 = atteint). */
  share: number;
  met: boolean;
  /** Fréquence : le repère dépasse les sorties possibles déclarées (le levier est plafonné par l'agenda). */
  capped?: boolean;
  /** Fréquence plafonnée : part du repère que l'agenda permet (2 possibles sur 3 → 0,67). */
  possibleShare?: number;
};

export type GoalGap = {
  race: string;
  levers: GoalLever[];
  main: GoalLever["key"] | null;
  /** Le levier principal, en action chiffrée ; null si tout est au niveau. */
  action: string | null;
  /** Une phrase pour le coach et les cartes : levier principal et action. */
  summary: string;
  /** Sorties par semaine visées pour la semaine type (une de plus à la fois, jusqu'au repère). */
  nextRunsPerWeek: number;
  /** Allure visée (s/km) et distance, pour situer la sortie longue. */
  goalPaceS: number;
  distanceKm: number;
  /** Temps visé tel que saisi (l'allure arrondie ne le redonne pas exactement). */
  targetTimeS: number;
  /**
   * Repère de fréquence hors de portée de l'agenda déclaré (« sorties possibles ») :
   * une phrase qui dit comment on compense, et que l'objectif peut se revoir. Null sinon.
   */
  availabilityNote: string | null;
  /**
   * Limite de l'allure du moment (semi, marathon) : elle vient du seuil et suppose l'endurance de la distance.
   * Dite quand la plus longue sortie est sous 80 % du repère. Null sinon.
   */
  paceCaveat: string | null;
};

/** En deçà de cette part du repère de sortie longue, l'allure tirée du seuil est optimiste sur semi et marathon. */
const ENDURANCE_CAVEAT_SHARE = 0.8;

function decimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function pace(seconds: number): string {
  return formatPace(1000 / seconds);
}

/** Sorties et km par semaine en moyenne sur les 8 semaines complètes avant la semaine en cours. */
export function completeWeeksAverage(runs: GapRun[], today: string, weeks = GAP_WINDOW_WEEKS): { runsPerWeek: number; kmPerWeek: number } {
  const end = startOfIsoWeek(today);
  const start = addDays(end, -7 * weeks);
  const inWindow = runs.filter((run) => run.localDate >= start && run.localDate < end);
  return { runsPerWeek: inWindow.length / weeks, kmPerWeek: inWindow.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000 / weeks };
}

/**
 * `availableRunsPerWeek` : sorties possibles déclarées dans l'objectif. C'est un plafond :
 * le moteur ne conseille jamais plus de sorties que l'agenda n'en permet, il compense par
 * la durée des sorties (sortie longue, volume) et le dit.
 */
export function goalGap(input: { target: RaceTarget; runs: GapRun[]; today: string; thresholdSpeedMps: number | null; eventDate?: string | null; availableRunsPerWeek?: number | null }): GoalGap | null {
  const goalPaceS = Math.round(input.target.targetTimeS / input.target.distanceKm);
  const bench = benchmarks(input.target.distanceKm, goalPaceS);
  if (!bench) return null;
  const { runsPerWeek, kmPerWeek } = completeWeeksAverage(input.runs, input.today);
  const from = addDays(input.today, -7 * GAP_WINDOW_WEEKS);
  const recent = input.runs.filter((run) => run.localDate > from && run.localDate <= input.today);
  const longestKm = Math.max(0, ...recent.map((run) => (run.distanceM ?? 0) / 1000));

  const available = input.availableRunsPerWeek ?? null;
  const capped = available != null && available < bench.runsPerWeek;
  const ceiling = capped ? (available as number) : bench.runsPerWeek;
  const levers: GoalLever[] = [
    { key: "frequency", label: "Sorties par semaine", current: decimal(runsPerWeek), needed: capped ? `${bench.runsPerWeek} (${available} possible${(available as number) > 1 ? "s" : ""})` : `${bench.runsPerWeek} au moins`, share: Math.min(1, runsPerWeek / bench.runsPerWeek), met: runsPerWeek >= bench.runsPerWeek - 0.25, ...(capped ? { capped: true, possibleShare: (available as number) / bench.runsPerWeek } : {}) },
    { key: "volume", label: "Volume", current: `${Math.round(kmPerWeek)} km/sem`, needed: `${bench.weeklyKm} km/sem`, share: Math.min(1, kmPerWeek / bench.weeklyKm), met: kmPerWeek >= bench.weeklyKm * 0.9 },
    { key: "long_run", label: "Plus longue sortie", current: `${decimal(longestKm)} km`, needed: `${bench.longRunKm} km`, share: Math.min(1, longestKm / bench.longRunKm), met: longestKm >= bench.longRunKm - 1 },
  ];

  const ratio = RACE_RATIO_FROM_THRESHOLD[bench.race];
  // Allure au seuil qu'implique le temps visé (vitesse de course = vitesse au seuil × ratio).
  const neededThresholdS = ratio ? Math.round(goalPaceS * ratio) : null;
  const currentThresholdS = input.thresholdSpeedMps ? paceSeconds(input.thresholdSpeedMps) : null;
  if (neededThresholdS != null && currentThresholdS != null) {
    const gap = currentThresholdS - neededThresholdS;
    levers.push({ key: "threshold", label: "Allure au seuil", current: pace(currentThresholdS), needed: pace(neededThresholdS), share: Math.min(1, neededThresholdS / currentThresholdS), met: gap <= THRESHOLD_MARGIN_S });
  }

  const frequency = levers[0];
  const volume = levers[1];
  const longRun = levers[2];
  const threshold = levers.find((lever) => lever.key === "threshold") ?? null;

  // Une sortie de plus à la fois : la semaine type passe de N à N + 1 sorties, jamais au-delà des sorties possibles.
  const atCeiling = runsPerWeek >= ceiling - 0.25;
  const nextRuns = Math.min(ceiling, Math.max(1, Math.ceil(runsPerWeek - 0.25)) + (atCeiling ? 0 : 1));
  // La fréquence n'est un levier que si l'agenda laisse de la place pour une sortie de plus.
  const frequencyOpen = !frequency.met && !atCeiling;
  let main: GoalLever["key"] | null = null;
  let action: string | null = null;
  const longKm = Math.max(1, Math.round(longestKm));
  const longSteps = Math.ceil(Math.max(0, bench.longRunKm - longKm) / LONG_STEP_KM);
  const longPlan = longSteps > 0 ? `allonge ta sortie longue de ${LONG_STEP_KM} km toutes les ${LONG_STEP_WEEKS} semaines (${longKm} → ${bench.longRunKm} km en ${longSteps * LONG_STEP_WEEKS} semaines)` : null;

  if ((frequencyOpen && frequency.share < STRUCTURAL_SHORTFALL) || (!volume.met && volume.share < STRUCTURAL_SHORTFALL)) {
    main = frequencyOpen ? "frequency" : "volume";
    const step = Math.max(1, Math.round(kmPerWeek * VOLUME_WEEKLY_GROWTH));
    const maximum = capped && nextRuns === available ? " (le maximum que tu as indiqué)" : "";
    action = frequencyOpen
      ? `Passe à ${nextRuns} sorties par semaine${maximum} : ajoute un footing facile de 30 à 40 min en Z2${longPlan ? ` ; ensuite, ${longPlan}` : ""}.`
      : capped
        ? `Avec ${available} sorties par semaine, le volume vient de leur durée : ${longPlan ?? "allonge tes sorties faciles de 10 min"}, sans dépasser +${step} km par semaine (${Math.round(kmPerWeek)} → ${bench.weeklyKm} km/sem).`
        : `Monte le volume de ${step} km par semaine au plus (${Math.round(kmPerWeek)} → ${bench.weeklyKm} km/sem)${longPlan ? ` ; ${longPlan}` : ""}.`;
  } else if (!longRun.met) {
    main = "long_run";
    action = `${longPlan ? longPlan.charAt(0).toUpperCase() + longPlan.slice(1) : "Allonge ta sortie longue"}, en Z2.`;
  } else if (threshold && !threshold.met) {
    main = "threshold";
    action = `Une séance au seuil par semaine (répétitions de 2 km et plus, ou 20 min continues) à ${threshold.current}, en visant ${threshold.needed} au fil des semaines.`;
  } else if (!volume.met) {
    main = "volume";
    action = `Monte le volume vers ${bench.weeklyKm} km/sem, 10 % par semaine au plus.`;
  }

  const mainLever = levers.find((lever) => lever.key === main) ?? null;
  let timing = "";
  if (input.eventDate && longSteps > 0 && (main === "long_run" || main === "frequency")) {
    const weeksLeft = Math.floor(daysBetween(input.today, input.eventDate as string) / 7);
    const weeksNeeded = longSteps * LONG_STEP_WEEKS;
    if (weeksLeft > 0 && weeksLeft < weeksNeeded + 2) timing = ` Course dans ${weeksLeft} semaines : c'est juste pour tout construire.`;
  }
  const summary = mainLever && action
    ? `Levier principal pour le ${bench.race} : ${mainLever.label.toLowerCase()} (${mainLever.current}, repère ${mainLever.needed}). ${action}${timing}`
    : `Pour le ${bench.race}, fréquence, volume, sortie longue et seuil sont au niveau des repères : garde la régularité.`;
  // Repère hors de l'agenda : dit une fois, comme un choix possible, jamais comme un reproche.
  const availabilityNote = capped && !frequency.met
    ? `Le repère courant pour le ${bench.race} est de ${bench.runsPerWeek} sorties par semaine, pour ${available} possible${(available as number) > 1 ? "s" : ""} dans ton agenda : le plan n'en ajoute pas et compense par la sortie longue et la qualité. Si l'écart reste grand, une ${bench.runsPerWeek}e sortie (même 30 min) ou un temps visé revu sont les deux options.`
    : null;
  const paceCaveat = input.target.distanceKm > 10.5 && longRun.share < ENDURANCE_CAVEAT_SHARE
    ? `Ce repère suppose l'endurance de la distance : avec ${longRun.current} de plus longue sortie (repère ${longRun.needed}), compte plus lent sur la fin tant que la sortie longue n'est pas construite.`
    : null;
  return { race: bench.race, levers, main, action, summary: availabilityNote ? `${summary} ${availabilityNote}` : summary, nextRunsPerWeek: nextRuns, goalPaceS, distanceKm: input.target.distanceKm, targetTimeS: input.target.targetTimeS, availabilityNote, paceCaveat };
}

/** Le levier demande-t-il de changer la semaine type (fréquence, volume, sortie longue) ? */
export function structuralLever(gap: GoalGap | null): boolean {
  return gap?.main === "frequency" || gap?.main === "volume" || gap?.main === "long_run";
}

/** Repère de sortie longue pour une distance de course (km), null sans repère. */
export function longRunBenchmarkKm(distanceKm: number, goalPaceS: number): number | null {
  return benchmarks(distanceKm, goalPaceS)?.longRunKm ?? null;
}

/**
 * Prochaine sortie longue (km) : +2 km dès que la plus longue sortie des 8 dernières
 * semaines a été tenue deux fois en 4 semaines (à 0,7 km près), sinon on la consolide ;
 * jamais au-delà du repère.
 */
export function nextLongRunKm(runs: GapRun[], today: string, benchmarkKm: number): { km: number; step: boolean; longestKm: number } {
  // Une course (semi en compétition…) prouve la distance mais ne se refait pas en sortie longue : seules les sorties d'entraînement comptent.
  const recent = runs.filter((run) => !run.raceLike && run.localDate > addDays(today, -7 * GAP_WINDOW_WEEKS) && run.localDate <= today);
  const longestKm = Math.max(0, ...recent.map((run) => (run.distanceM ?? 0) / 1000));
  const base = Math.max(6, Math.round(longestKm));
  const held = recent.filter((run) => run.localDate > addDays(today, -28) && (run.distanceM ?? 0) / 1000 >= longestKm - 0.7).length;
  const step = held >= 2 && base < benchmarkKm;
  return { km: Math.min(benchmarkKm, step ? base + LONG_STEP_KM : base), step, longestKm: Math.round(longestKm * 10) / 10 };
}

/**
 * L'écart qui décide (jauge, lien d'une analyse à l'objectif) : le même que la semaine type,
 * soit l'objectif le plus long dont le levier est structurel, sinon le premier avec un levier.
 */
export function primaryGap(gaps: GoalGap[]): GoalGap | null {
  const structural = [...gaps].filter(structuralLever).sort((a, b) => b.distanceKm - a.distanceKm)[0];
  return structural ?? gaps.find((gap) => gap.main != null) ?? gaps[0] ?? null;
}
