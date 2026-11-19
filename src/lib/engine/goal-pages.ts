import { addDays, startOfIsoWeek } from "@/lib/dates";
import { formatClock } from "@/lib/formatters";
import type { AthleteLevel } from "./athlete-level";
import { primaryGap, type GoalGap } from "./goal-gap";
import type { GoalMarker } from "./prescription";

/**
 * Pages de la carte objectif (une par objectif pertinent, on les fait glisser) :
 * - « chrono » : un objectif chiffré (5 km en 19:00) : écart d'allure et leviers ;
 * - « distance » : une distance sans temps visé (courir 10 km) : plus longue sortie et palier suivant ;
 * - « régularité » : toujours là, et première pour un débutant : sorties par semaine, série en cours.
 * Chaque page porte un « prochain palier » : ce qui vient après, atteint ou non. Pur, testé.
 */

export type ChronoPage = { kind: "chrono"; key: string; title: string; gap: GoalGap; marker: GoalMarker | null; reached: boolean; next: string | null };
export type DistancePage = { kind: "distance"; key: string; title: string; targetKm: number; longestKm: number; share: number; reached: boolean; next: string };
export type RegularityPage = {
  kind: "regularity";
  key: string;
  title: string;
  /** Sorties par semaine visées (objectif, sinon habitude arrondie, 2 au moins). */
  target: number;
  /** Semaines d'affilée à la cible (la semaine en cours compte dès qu'elle l'atteint). */
  streakWeeks: number;
  /** Semaines à la cible sur les 8 dernières semaines terminées. */
  weeksAtTarget: number;
  thisWeekRuns: number;
  /** Palier de série visé (2, 4, 8, 12, 26, 52 semaines). */
  milestone: number;
  next: string;
};
export type GoalPage = ChronoPage | DistancePage | RegularityPage;

export type PageRun = { localDate: string; distanceM: number | null };

const STREAK_MILESTONES = [2, 4, 8, 12, 26, 52];
const RACES = [5, 10, 21.0975, 42.195];

function raceName(km: number): string {
  if (Math.abs(km - 21.0975) < 0.05) return "semi";
  if (Math.abs(km - 42.195) < 0.05) return "marathon";
  return `${String(Math.round(km * 10) / 10).replace(".", ",")} km`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Temps visé 2 % plus vite, arrondi (5 s sous l'heure, 30 s au-delà) : un palier, pas un saut. */
function nextTime(targetS: number): number {
  const step = targetS < 3600 ? 5 : 30;
  return Math.round((targetS * 0.98) / step) * step;
}

export function regularityPage(runs: PageRun[], today: string, target: number): RegularityPage {
  const currentStart = startOfIsoWeek(today);
  const countIn = (start: string) => runs.filter((run) => run.localDate >= start && run.localDate < addDays(start, 7) && run.localDate <= today).length;
  const thisWeekRuns = countIn(currentStart);
  let streak = thisWeekRuns >= target ? 1 : 0;
  for (let week = 1; week <= 104; week += 1) {
    if (countIn(addDays(currentStart, -7 * week)) >= target) streak += 1;
    else break;
  }
  const weeksAtTarget = Array.from({ length: 8 }, (_, index) => countIn(addDays(currentStart, -7 * (index + 1)))).filter((count) => count >= target).length;
  const milestone = STREAK_MILESTONES.find((value) => value > streak) ?? streak + 4;
  const left = Math.max(0, target - thisWeekRuns);
  const next = streak === 0
    ? `Prochain palier : ${target} sorties cette semaine pour lancer ta série${left > 0 && left < target ? ` (encore ${left})` : ""}.`
    : `Prochain palier : ${milestone} semaines d'affilée à ${target} sorties (encore ${milestone - streak}).`;
  return { kind: "regularity", key: "regularity", title: "Régularité", target, streakWeeks: streak, weeksAtTarget, thisWeekRuns, milestone, next };
}

export function distancePage(runs: PageRun[], today: string, targetKm: number): DistancePage {
  const recent = runs.filter((run) => run.localDate > addDays(today, -56) && run.localDate <= today);
  const longestKm = Math.round(Math.max(0, ...recent.map((run) => (run.distanceM ?? 0) / 1000)) * 10) / 10;
  const reached = longestKm >= targetKm - 0.2;
  const following = RACES.find((km) => km > targetKm + 0.5);
  const next = reached
    ? following ? `Distance atteinte. Prochain palier : ${raceName(following)}, en allongeant ta plus longue sortie de 1 km toutes les 2 semaines.` : "Distance atteinte : garde-la confortable, en endurance."
    : `Prochain palier : ${Math.min(targetKm, Math.floor(longestKm) + 1)} km d'une traite, en facile (1 km de plus que ta plus longue).`;
  return { kind: "distance", key: `distance-${targetKm}`, title: `Courir ${raceName(targetKm)}`, targetKm, longestKm, share: Math.min(1, longestKm / targetKm), reached, next };
}

export function chronoPage(gap: GoalGap, marker: GoalMarker | null): ChronoPage {
  const reached = marker?.status === "reachable" && gap.levers.every((lever) => lever.met);
  return {
    kind: "chrono",
    key: `chrono-${gap.race}`,
    title: `${capitalize(gap.race)} en ${formatClock(gap.targetTimeS)}`,
    gap,
    marker,
    reached,
    next: reached ? `À portée. Prochain palier : ${gap.race} en ${formatClock(nextTime(gap.targetTimeS))}.` : null,
  };
}

/**
 * Pages dans l'ordre du niveau : un débutant voit d'abord sa régularité, puis la distance ;
 * un confirmé d'abord le chrono qui décide de la semaine type.
 */
export function goalPages(input: { level: AthleteLevel; gaps: GoalGap[]; markers: GoalMarker[]; runs: PageRun[]; today: string; goal: { distanceKm: number | null; targetTimeS: number | null; runsPerWeek: number } | null; habitualRunsPerWeek: number }): GoalPage[] {
  const main = primaryGap(input.gaps);
  const chrono = [...input.gaps].sort((a, b) => (a === main ? -1 : b === main ? 1 : 0)).map((gap) => chronoPage(gap, input.markers.find((marker) => marker.race === gap.race) ?? null));
  const goal = input.goal;
  const distanceOnly = goal?.distanceKm && !input.gaps.some((gap) => Math.abs(gap.distanceKm - (goal.distanceKm as number)) < 0.05) ? [distancePage(input.runs, input.today, goal.distanceKm)] : [];
  const target = goal?.runsPerWeek ?? Math.max(2, Math.round(input.habitualRunsPerWeek));
  const regularity = regularityPage(input.runs, input.today, target);
  if (input.level === "beginner") return [regularity, ...distanceOnly, ...chrono];
  return [...chrono, ...distanceOnly, regularity];
}

