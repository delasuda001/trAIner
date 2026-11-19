import { addDays, daysBetween } from "@/lib/dates";

/**
 * Niveau du coureur, déduit de ses données (jamais déclaré) : il règle le ton et les
 * indicateurs mis en avant dans la vue essentielle, jamais le conseil lui-même.
 *
 * On juge l'EXPÉRIENCE (ancienneté, régularité sur l'année, séances structurées), pas le
 * volume du moment : un coureur confirmé qui court peu en ce moment (Bastien, ~1,5 sortie
 * par semaine mais des fractionnés au seuil depuis des années) reste confirmé ; son levier
 * (le volume) est dit par l'écart à l'objectif, pas par un niveau rabaissé.
 */

export type AthleteLevel = "beginner" | "intermediate" | "confirmed";

export type LevelRun = { localDate: string; distanceM: number | null; family: string };

export type LevelAssessment = {
  level: AthleteLevel;
  /** Pourquoi, en clair (affiché dans « Pourquoi cette vue ? »). */
  reason: string;
  signals: { historyWeeks: number; activeMonths12: number; runs12m: number; quality12w: number; kmPerWeek12w: number };
};

const QUALITY_FAMILIES = new Set(["intervals", "steady"]);

export function detectLevel(runs: LevelRun[], today: string): LevelAssessment {
  const past = runs.filter((run) => run.localDate <= today);
  const first = past[0]?.localDate ?? today;
  const historyWeeks = Math.floor(daysBetween(first, today) / 7);
  const year = past.filter((run) => run.localDate > addDays(today, -365));
  const activeMonths12 = new Set(year.map((run) => run.localDate.slice(0, 7))).size;
  const recent = past.filter((run) => run.localDate > addDays(today, -84));
  const quality12w = recent.filter((run) => QUALITY_FAMILIES.has(run.family)).length;
  const kmPerWeek12w = Math.round((recent.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000 / 12) * 10) / 10;
  const signals = { historyWeeks, activeMonths12, runs12m: year.length, quality12w, kmPerWeek12w };

  if (historyWeeks < 26 || (year.length < 25 && quality12w === 0)) {
    return { level: "beginner", signals, reason: historyWeeks < 26 ? `Tu cours depuis ${Math.max(1, historyWeeks)} semaine${historyWeeks > 1 ? "s" : ""} : on met en avant la régularité et le prochain palier.` : "Peu de sorties sur l'année et pas encore de séance structurée : on met en avant la régularité et le prochain palier." };
  }
  if (activeMonths12 >= 9 && (quality12w >= 3 || kmPerWeek12w >= 30)) {
    return { level: "confirmed", signals, reason: "Tu cours toute l'année avec des séances structurées : on met en avant l'écart au chrono, le seuil et la charge." };
  }
  return { level: "intermediate", signals, reason: "Tu cours régulièrement : on met en avant ton objectif et ce qui t'en rapproche." };
}
