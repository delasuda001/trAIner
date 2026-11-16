import { addDays, daysBetween, startOfIsoWeek } from "@/lib/dates";
import { round } from "./stats";

export type LoadActivity = {
  localDate: string;
  sport: string;
  distanceM: number | null;
  movingTimeS: number | null;
  trainingLoad: number | null;
  hrTimeInZonesS: number[] | null;
};

export type WeekVolume = { weekStart: string; runKm: number; runCount: number; otherMinutes: number; load: number };

export type LoadSummary = {
  /** Somme des charges Garmin sur les 7 derniers jours. */
  acute7d: number;
  /** Moyenne hebdomadaire sur les 28 derniers jours. */
  chronicWeekly28d: number;
  /** acute / chronique ; null si pas d'historique. */
  ratio: number | null;
  /** Répartition du temps en zones FC sur 28 jours (toutes activités). */
  intensity28d: { low: number; moderate: number; high: number; totalMinutes: number } | null;
  weeks: WeekVolume[];
  runsPerWeek8w: number;
  runKmPerWeek8w: number;
};

const RUN_SPORTS = new Set(["running", "trail_running", "treadmill_running"]);

export function isRun(sport: string): boolean {
  return RUN_SPORTS.has(sport);
}

export function summarizeLoad(activities: LoadActivity[], today: string, weeksCount = 12): LoadSummary {
  const within = (days: number) => activities.filter((activity) => {
    const age = daysBetween(activity.localDate, today);
    return age >= 0 && age < days;
  });
  const sumLoad = (list: LoadActivity[]) => list.reduce((sum, activity) => sum + (activity.trainingLoad ?? 0), 0);
  const acute = sumLoad(within(7));
  const chronic = sumLoad(within(28)) / 4;

  const zones = [0, 0, 0, 0, 0];
  for (const activity of within(28)) activity.hrTimeInZonesS?.forEach((seconds, index) => (zones[index] += seconds));
  const totalZones = zones.reduce((sum, value) => sum + value, 0);

  const currentWeek = startOfIsoWeek(today);
  const weeks: WeekVolume[] = Array.from({ length: weeksCount }, (_, index) => {
    const weekStart = addDays(currentWeek, -7 * (weeksCount - 1 - index));
    const weekEnd = addDays(weekStart, 6);
    const list = activities.filter((activity) => activity.localDate >= weekStart && activity.localDate <= weekEnd);
    const runs = list.filter((activity) => isRun(activity.sport));
    return {
      weekStart,
      runKm: round(runs.reduce((sum, activity) => sum + (activity.distanceM ?? 0), 0) / 1000, 1),
      runCount: runs.length,
      otherMinutes: Math.round(list.filter((activity) => !isRun(activity.sport)).reduce((sum, activity) => sum + (activity.movingTimeS ?? 0), 0) / 60),
      load: Math.round(sumLoad(list)),
    };
  });

  const runs56 = within(56).filter((activity) => isRun(activity.sport));
  return {
    acute7d: Math.round(acute),
    chronicWeekly28d: Math.round(chronic),
    ratio: chronic > 0 ? round(acute / chronic, 2) : null,
    intensity28d: totalZones > 0
      ? { low: round((zones[0] + zones[1]) / totalZones, 3), moderate: round(zones[2] / totalZones, 3), high: round((zones[3] + zones[4]) / totalZones, 3), totalMinutes: Math.round(totalZones / 60) }
      : null,
    weeks,
    runsPerWeek8w: round(runs56.length / 8, 1),
    runKmPerWeek8w: round(runs56.reduce((sum, activity) => sum + (activity.distanceM ?? 0), 0) / 1000 / 8, 1),
  };
}
