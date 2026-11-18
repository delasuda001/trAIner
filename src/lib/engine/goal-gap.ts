import { addDays, daysBetween } from "@/lib/dates";
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
 * Tout est mesuré sur les 8 dernières semaines.
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

export type GapRun = { localDate: string; distanceM: number | null };

export type GoalLever = {
  key: "frequency" | "volume" | "long_run" | "threshold";
  label: string;
  current: string;
  needed: string;
  /** Part du repère atteinte (1 = atteint). */
  share: number;
  met: boolean;
};

export type GoalGap = {
  race: string;
  levers: GoalLever[];
  main: GoalLever["key"] | null;
  /** Le levier principal, en action chiffrée ; null si tout est au niveau. */
  action: string | null;
  /** Une phrase pour le coach et les cartes : levier principal et action. */
  summary: string;
};

function decimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function pace(seconds: number): string {
  return formatPace(1000 / seconds);
}

export function goalGap(input: { target: RaceTarget; runs: GapRun[]; today: string; thresholdSpeedMps: number | null; eventDate?: string | null }): GoalGap | null {
  const goalPaceS = Math.round(input.target.targetTimeS / input.target.distanceKm);
  const bench = benchmarks(input.target.distanceKm, goalPaceS);
  if (!bench) return null;
  const from = addDays(input.today, -7 * GAP_WINDOW_WEEKS);
  const recent = input.runs.filter((run) => run.localDate > from && run.localDate <= input.today);
  const runsPerWeek = recent.length / GAP_WINDOW_WEEKS;
  const kmPerWeek = recent.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000 / GAP_WINDOW_WEEKS;
  const longestKm = Math.max(0, ...recent.map((run) => (run.distanceM ?? 0) / 1000));

  const levers: GoalLever[] = [
    { key: "frequency", label: "Sorties par semaine", current: decimal(runsPerWeek), needed: `${bench.runsPerWeek} au moins`, share: Math.min(1, runsPerWeek / bench.runsPerWeek), met: runsPerWeek >= bench.runsPerWeek - 0.25 },
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

  let main: GoalLever["key"] | null = null;
  let action: string | null = null;
  const longKm = Math.max(1, Math.round(longestKm));
  const longSteps = Math.ceil(Math.max(0, bench.longRunKm - longKm) / LONG_STEP_KM);
  const longPlan = longSteps > 0 ? `allonge ta sortie longue de ${LONG_STEP_KM} km toutes les ${LONG_STEP_WEEKS} semaines (${longKm} → ${bench.longRunKm} km en ${longSteps * LONG_STEP_WEEKS} semaines)` : null;

  if ((!frequency.met && frequency.share < STRUCTURAL_SHORTFALL) || (!volume.met && volume.share < STRUCTURAL_SHORTFALL)) {
    main = !frequency.met ? "frequency" : "volume";
    // Une sortie de plus à la fois : la semaine type passe de N à N + 1 sorties.
    const nextRuns = Math.min(bench.runsPerWeek, Math.ceil(runsPerWeek - 0.25) + 1);
    const step = Math.max(1, Math.round(kmPerWeek * VOLUME_WEEKLY_GROWTH));
    action = !frequency.met
      ? `Passe à ${nextRuns} sorties par semaine : ajoute un footing facile de 30 à 40 min en Z2${longPlan ? ` ; ensuite, ${longPlan}` : ""}.`
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
  return { race: bench.race, levers, main, action, summary };
}
