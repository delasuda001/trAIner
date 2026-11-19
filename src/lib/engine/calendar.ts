import type { SessionKind } from "./activity-metrics";
import { addDays, daysBetween, startOfIsoWeek } from "@/lib/dates";

/**
 * Calendrier des séances (façon carte de chaleur) : N semaines, lundi → dimanche,
 * une case par jour. Pur : l'interface ne fait que dessiner.
 *
 * Seules les courses comptent pour la cible de sorties par semaine ; les autres
 * sports restent visibles, sans compter. La semaine en cours n'est pas jugée
 * (elle n'est pas finie) : on montre ce qui reste à faire, pas un manque.
 */

export type CalendarInput = {
  today: string;
  weeks: number;
  /** Sorties par semaine visées (objectif ou semaine type), null si aucune. */
  target: number | null;
  activities: Array<{ id: string; date: string; run: boolean; zone: number | null; family: string; title: string; distanceM: number | null }>;
  /** Jours où une séance est proposée (semaine en cours) ; `alternative` : jour de repli d'une fenêtre de 2 jours. */
  planned: Array<{ date: string; type: string; alternative: boolean }>;
};

export type CalendarDay = {
  date: string;
  isToday: boolean;
  isFuture: boolean;
  activities: CalendarInput["activities"];
  planned: CalendarInput["planned"][number] | null;
};

export type CalendarWeek = { start: string; days: CalendarDay[]; runs: number; runKm: number; current: boolean };

export type TrainingCalendar = {
  weeks: CalendarWeek[];
  target: number | null;
  /** Moyenne de courses par semaine sur les semaines terminées. */
  averageRunsPerWeek: number;
  /** Semaines terminées où la cible est atteinte. */
  weeksAtTarget: number;
  completedWeeks: number;
};

export function trainingCalendar(input: CalendarInput): TrainingCalendar {
  const currentStart = startOfIsoWeek(input.today);
  const firstStart = addDays(currentStart, -7 * (input.weeks - 1));
  const weeks: CalendarWeek[] = Array.from({ length: input.weeks }, (_, weekIndex) => {
    const start = addDays(firstStart, 7 * weekIndex);
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, dayIndex);
      return {
        date,
        isToday: date === input.today,
        isFuture: daysBetween(input.today, date) > 0,
        activities: input.activities.filter((activity) => activity.date === date),
        planned: input.planned.find((entry) => entry.date === date) ?? null,
      };
    });
    const runs = days.flatMap((day) => day.activities.filter((activity) => activity.run));
    return {
      start,
      days,
      runs: runs.length,
      runKm: Math.round(runs.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 100) / 10,
      current: start === currentStart,
    };
  });
  const completed = weeks.filter((week) => !week.current);
  const totalRuns = completed.reduce((sum, week) => sum + week.runs, 0);
  return {
    weeks,
    target: input.target,
    averageRunsPerWeek: completed.length ? Math.round((totalRuns / completed.length) * 10) / 10 : 0,
    weeksAtTarget: input.target == null ? 0 : completed.filter((week) => week.runs >= (input.target as number)).length,
    completedWeeks: completed.length,
  };
}

/** Zone d'intensité de chaque type de séance de qualité (couleur du calendrier). */
const QUALITY_ZONE: Partial<Record<SessionKind, number>> = { intervals_short: 5, intervals_vo2: 5, intervals_threshold: 4, threshold: 4, intervals_tempo: 3, tempo: 3 };

/**
 * Couleur d'une course dans le calendrier : pour une séance de qualité, l'intensité du travail (un fractionné
 * passe la plupart de son temps en échauffement et récupération, sa zone dominante le ferait passer pour une
 * endurance) ; sinon la zone dominante du temps passé.
 */
export function calendarZone(kind: SessionKind | null, zoneShares: number[] | null | undefined): number | null {
  const quality = kind ? QUALITY_ZONE[kind] : undefined;
  if (quality != null) return quality;
  if (!zoneShares || !zoneShares.some((value) => value > 0)) return null;
  let best = 0;
  zoneShares.forEach((value, index) => { if (value > zoneShares[best]) best = index; });
  return best + 1;
}
