import { daysBetween } from "@/lib/dates";
import type { SessionKind } from "./activity-metrics";

/**
 * Félicitations à l'ouverture après une séance difficile, une seule fois par séance. Règle générale,
 * pour tous les profils : séance de qualité (seuil, tempo, fractionné), sortie de 90 min et plus,
 * effet aérobie Garmin ≥ 4, ou effort perçu ≥ 8/10 ; courue dans les 3 derniers jours. Pur, testé.
 */

export type KudosRun = {
  id: string;
  localDate: string;
  kind: SessionKind;
  title: string;
  distanceM: number | null;
  movingTimeS: number | null;
  aerobicTrainingEffect: number | null;
  perceivedEffort: number | null;
};

export type Kudos = { id: string; headline: string; detail: string };

const QUALITY: ReadonlySet<SessionKind> = new Set(["tempo", "threshold", "intervals_short", "intervals_vo2", "intervals_threshold", "intervals_tempo"]);
export const KUDOS_MAX_AGE_DAYS = 3;

export function isHardSession(run: KudosRun): boolean {
  return QUALITY.has(run.kind) || (run.movingTimeS ?? 0) >= 90 * 60 || (run.aerobicTrainingEffect ?? 0) >= 4 || (run.perceivedEffort ?? 0) >= 8;
}

function when(localDate: string, today: string): string {
  const days = daysBetween(localDate, today);
  return days <= 0 ? "aujourd'hui" : days === 1 ? "hier" : `il y a ${days} jours`;
}

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
}

export function sessionKudos(run: KudosRun | null, today: string, seenId: string | null): Kudos | null {
  if (!run || run.id === seenId || !isHardSession(run)) return null;
  const age = daysBetween(run.localDate, today);
  if (age < 0 || age > KUDOS_MAX_AGE_DAYS) return null;
  const headline = run.kind === "long" || (run.movingTimeS ?? 0) >= 90 * 60 ? "Belle sortie longue, dans les jambes." : QUALITY.has(run.kind) ? "Séance de qualité bouclée. Bravo." : "Grosse séance. Bravo.";
  const facts = [run.title, run.distanceM ? `${String(Math.round(run.distanceM / 100) / 10).replace(".", ",")} km` : null, run.movingTimeS ? duration(run.movingTimeS) : null].filter(Boolean).join(" · ");
  return { id: run.id, headline, detail: `${facts}, ${when(run.localDate, today)}. Récupère bien : la suite en tient compte.` };
}
