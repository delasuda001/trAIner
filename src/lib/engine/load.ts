import { addDays, daysBetween, startOfIsoWeek } from "@/lib/dates";
import { median, round } from "./stats";

export type LoadActivity = {
  localDate: string;
  sport: string;
  distanceM: number | null;
  movingTimeS: number | null;
  trainingLoad: number | null;
  hrTimeInZonesS: number[] | null;
};

/** Minutes par intensité : Z1–Z2 / Z3 / Z4–Z5 (toutes activités avec FC). */
export type WeekVolume = {
  weekStart: string; runKm: number; runCount: number; otherMinutes: number; load: number; lowMin: number; moderateMin: number; highMin: number;
  /** Km de course par zone dominante de chaque sortie (Z1 à Z5) ; index 5 = zone inconnue. */
  kmByZone: [number, number, number, number, number, number];
  /** Minutes par zone FC, toutes activités (Z1 à Z5). */
  zoneMinutes: [number, number, number, number, number];
};

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
      ...(() => {
        const zones = [0, 0, 0, 0, 0];
        for (const activity of list) activity.hrTimeInZonesS?.forEach((seconds, zone) => (zones[zone] += seconds));
        const kmByZone: WeekVolume["kmByZone"] = [0, 0, 0, 0, 0, 0];
        for (const run of runs) {
          const shares = run.hrTimeInZonesS;
          const best = shares && shares.some((value) => value > 0) ? shares.indexOf(Math.max(...shares)) : 5;
          kmByZone[best] = round(kmByZone[best] + (run.distanceM ?? 0) / 1000, 1);
        }
        return {
          lowMin: Math.round((zones[0] + zones[1]) / 60), moderateMin: Math.round(zones[2] / 60), highMin: Math.round((zones[3] + zones[4]) / 60),
          kmByZone,
          zoneMinutes: zones.map((seconds) => Math.round(seconds / 60)) as WeekVolume["zoneMinutes"],
        };
      })(),
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

/** Ratio charge 7 jours / moyenne 4 semaines à partir duquel la hausse est « marquée ». */
export const HIGH_LOAD_RATIO = 1.5;
/** Charge 7 jours « nettement » au-dessus de l'habitude : × 1,3 la semaine médiane des 12 dernières. */
export const ABSOLUTE_LOAD_FACTOR = 1.3;
/** Effort perçu (sur 10) jugé élevé. */
export const HIGH_PERCEIVED_EFFORT = 8;

export type LoadAlert = {
  ratio: number | null;
  /** Ratio au-dessus du seuil : simple information tant qu'il n'est pas corroboré. */
  ratioHigh: boolean;
  /** Ratio haut ET corroboré : justifie une consigne (report, séance facile). */
  actionable: boolean;
  /** Ce qui corrobore la hausse, en clair et chiffré. */
  reasons: string[];
  /** Semaine habituelle (médiane des semaines complètes avec activité, 12 semaines). */
  typicalWeekLoad: number | null;
};

const FLAG_TEXT: Record<string, string> = { hrv_low: "VFC sous ta plage habituelle", resting_hr_high: "FC de repos au-dessus de ta base", sleep_short: "nuit nettement plus courte" };

/**
 * Avec 1 à 2 sorties par semaine, le ratio aigu/chronique seul est trop bruité
 * pour remplacer une séance. Il ne déclenche une consigne que s'il est
 * corroboré par un signal de récupération, un ressenti élevé, ou une charge
 * absolue nettement au-dessus de l'habitude sur 12 semaines.
 */
export function loadAlert(load: LoadSummary, corroboration: { recoveryFlags: string[]; perceivedEffort?: number | null }): LoadAlert {
  const ratioHigh = load.ratio != null && load.ratio >= HIGH_LOAD_RATIO;
  const complete = load.weeks.slice(0, -1).map((week) => week.load).filter((value) => value > 0);
  const typical = complete.length >= 4 ? Math.round(median(complete) as number) : null;
  const reasons: string[] = corroboration.recoveryFlags.map((flag) => FLAG_TEXT[flag] ?? flag);
  if (corroboration.perceivedEffort != null && corroboration.perceivedEffort >= HIGH_PERCEIVED_EFFORT) reasons.push(`effort perçu à ${corroboration.perceivedEffort}/10`);
  if (typical != null && load.acute7d >= typical * ABSOLUTE_LOAD_FACTOR) reasons.push(`${load.acute7d} de charge sur 7 jours contre ${typical} une semaine habituelle`);
  return { ratio: load.ratio, ratioHigh, actionable: ratioHigh && reasons.length > 0, reasons, typicalWeekLoad: typical };
}
