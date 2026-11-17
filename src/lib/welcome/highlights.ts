import { addDays } from "@/lib/dates";

/**
 * Chiffres marquants montrés à un invité à sa première ouverture : ce que sa
 * montre raconte de ses 12 derniers mois. Fonction pure, testée.
 */

export type HighlightRun = { localDate: string; distanceM: number | null; movingTimeS: number | null };

export type Highlights = {
  runs: number;
  km: number;
  hours: number;
  longestKm: number | null;
  /** Semaines (sur 52) avec au moins une course. */
  activeWeeks: number;
  /** Mois le plus chargé (AAAA-MM) et ses km. */
  bestMonth: { month: string; km: number } | null;
};

export function welcomeHighlights(runs: HighlightRun[], today: string): Highlights {
  const since = addDays(today, -365);
  const year = runs.filter((run) => run.localDate > since && run.localDate <= today);
  const km = year.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const longest = year.reduce<number | null>((best, run) => (run.distanceM != null && (best == null || run.distanceM > best) ? run.distanceM : best), null);
  // 52 semaines glissantes (0 à 51), la plus ancienne absorbant le jour en trop.
  const weeks = new Set(year.map((run) => Math.min(51, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${run.localDate}T00:00:00Z`)) / (7 * 86_400_000)))));
  const months = new Map<string, number>();
  for (const run of year) months.set(run.localDate.slice(0, 7), (months.get(run.localDate.slice(0, 7)) ?? 0) + (run.distanceM ?? 0) / 1000);
  let bestMonth: Highlights["bestMonth"] = null;
  for (const [month, value] of months) if (!bestMonth || value > bestMonth.km) bestMonth = { month, km: Math.round(value) };
  return {
    runs: year.length,
    km: Math.round(km),
    hours: Math.round(year.reduce((sum, run) => sum + (run.movingTimeS ?? 0), 0) / 3600),
    longestKm: longest == null ? null : Math.round(longest / 100) / 10,
    activeWeeks: weeks.size,
    bestMonth,
  };
}
