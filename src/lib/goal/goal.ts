import { z } from "zod";
import { daysBetween } from "@/lib/dates";
import { formatClock, formatDate, formatPace } from "@/lib/formatters";

/**
 * Objectif de l'athlète, saisi une fois et stocké localement. Tout reste
 * optionnel : sans objectif, le coach raisonne sur la progression aérobie
 * et le rythme habituel.
 */

export const WEEKDAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

export const goalSchema = z.object({
  title: z.string().trim().max(100).default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  distanceKm: z.number().positive().max(250).nullable().default(null),
  /** Temps visé en secondes. */
  targetTimeS: z.number().int().positive().max(48 * 3600).nullable().default(null),
  runsPerWeek: z.number().int().min(1).max(7).default(2),
  /** 0 = lundi … 6 = dimanche. */
  preferredDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  note: z.string().trim().max(300).default(""),
  /** Objectifs chiffrés (5 km en 19:00, semi en 1:27:00…) : servent de repères aux consignes du moteur. */
  raceTargets: z.array(z.object({ distanceKm: z.number().positive().max(250), targetTimeS: z.number().int().positive().max(48 * 3600) })).max(4).default([]),
});

export type Goal = z.infer<typeof goalSchema>;

export const GOAL_KEY = "athlete_goal";

export const EMPTY_GOAL: Goal = goalSchema.parse({});

export function targetPaceMps(goal: Goal): number | null {
  return goal.distanceKm && goal.targetTimeS ? (goal.distanceKm * 1000) / goal.targetTimeS : null;
}

export const RACE_DISTANCES = [
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "Semi", value: 21.0975 },
  { label: "Marathon", value: 42.195 },
] as const;

function raceLabel(distanceKm: number): string {
  return RACE_DISTANCES.find((race) => Math.abs(race.value - distanceKm) < 0.05)?.label.toLowerCase() ?? `${String(distanceKm).replace(".", ",")} km`;
}

export function hasGoal(goal: Goal | null): goal is Goal {
  return goal != null && (goal.title.length > 0 || goal.eventDate != null);
}

/** Objectif mis en forme pour la charge utile du coach (chiffres déjà formatés). */
export function goalForCoach(goal: Goal | null, today: string): Record<string, string> {
  if (!goal) return { objectif: "non renseigné", sorties_par_semaine_possibles: "1 à 2 (habitude constatée)" };
  const pace = targetPaceMps(goal);
  return {
    objectif: goal.title || (goal.eventDate ? "course" : "non renseigné"),
    date: goal.eventDate ? formatDate(goal.eventDate, "long") : "—",
    dans: goal.eventDate ? `${Math.max(0, daysBetween(today, goal.eventDate))} jours` : "—",
    distance: goal.distanceKm ? `${String(goal.distanceKm).replace(".", ",")} km` : "—",
    temps_vise: goal.targetTimeS ? formatClock(goal.targetTimeS) : "—",
    allure_visee: pace ? formatPace(pace) : "—",
    sorties_par_semaine_possibles: String(goal.runsPerWeek),
    jours_preferes: goal.preferredDays.length ? goal.preferredDays.map((day) => WEEKDAY_LABELS[day].toLowerCase()).join(", ") : "—",
    precision: goal.note || "—",
    ...(goal.raceTargets.length ? { objectifs_chiffres: goal.raceTargets.map((target) => `${raceLabel(target.distanceKm)} en ${formatClock(target.targetTimeS)} (${formatPace((target.distanceKm * 1000) / target.targetTimeS)})`).join(", ") } : {}),
  };
}

const SEMI_KM = 21.0975;
const MARATHON_KM = 42.195;
/** Allures plausibles (s/km) pour accepter un objectif lu dans le titre. */
const PLAUSIBLE_PACE_S = { min: 150, max: 720 } as const;

function parseDistanceKm(text: string): { km: number; rest: string } | null {
  const semi = /semi(?:[\s-]*marathon)?/.exec(text);
  if (semi) return { km: SEMI_KM, rest: text.replace(semi[0], " ") };
  const marathon = /marathon/.exec(text);
  if (marathon) return { km: MARATHON_KM, rest: text.replace(marathon[0], " ") };
  const km = /(\d+(?:[.,]\d+)?)\s*(?:km|k)(?![a-z])/.exec(text);
  if (!km) return null;
  return { km: Number(km[1].replace(",", ".")), rest: text.replace(km[0], " ") };
}

function parseTimeS(text: string): number | null {
  const hms = /(\d{1,2}):(\d{2}):(\d{2})/.exec(text);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const hours = /(\d{1,2})\s*h\s*(\d{2})?(?!\d)/.exec(text);
  if (hours) return Number(hours[1]) * 3600 + Number(hours[2] ?? 0) * 60;
  const ms = /(\d{1,3}):(\d{2})(?!\d)/.exec(text);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  const minutes = /(\d{1,3})\s*(?:min(?:utes?)?|mn|')(?![a-z])/.exec(text);
  if (minutes) return Number(minutes[1]) * 60;
  return null;
}

/**
 * Objectif chiffré lu dans le titre libre (« 10 km sous 50 min », « semi en 1h45 »,
 * « 5 km en 24:30 ») quand la distance et le temps n'ont pas été saisis à part.
 * Null si l'un manque ou si l'allure obtenue n'est pas plausible.
 */
export function inferRaceTarget(title: string): { distanceKm: number; targetTimeS: number } | null {
  const text = title.toLowerCase().replace(/ /g, " ");
  const distance = parseDistanceKm(text);
  if (!distance || distance.km <= 0 || distance.km > 250) return null;
  const timeS = parseTimeS(distance.rest);
  if (!timeS) return null;
  const paceS = timeS / distance.km;
  if (paceS < PLAUSIBLE_PACE_S.min || paceS > PLAUSIBLE_PACE_S.max) return null;
  return { distanceKm: distance.km, targetTimeS: timeS };
}

/**
 * Objectif utilisé par le moteur : sans objectif chiffré saisi, on reprend la
 * distance et le temps saisis à part, sinon ceux lus dans le titre. Rien n'est
 * écrit en base ; un objectif déjà chiffré est rendu tel quel.
 */
export function withInferredTarget(goal: Goal): Goal {
  if (goal.raceTargets.length) return goal;
  if (goal.distanceKm && goal.targetTimeS) return { ...goal, raceTargets: [{ distanceKm: goal.distanceKm, targetTimeS: goal.targetTimeS }] };
  if (goal.distanceKm || goal.targetTimeS) return goal;
  const inferred = inferRaceTarget(goal.title);
  return inferred ? { ...goal, ...inferred, raceTargets: [inferred] } : goal;
}
