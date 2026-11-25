import "server-only";

import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { startOfIsoWeek } from "@/lib/dates";
import type { WeekConstraint } from "@/lib/engine/suggestion";

/** Contrainte de la semaine dite au coach (sorties possibles, jours indisponibles), gardée dans la base du profil. */
export const WEEK_CONSTRAINT_KEY = "week_constraint";

const constraintSchema = z.object({ weekStart: z.string(), runsThisWeek: z.number().int().min(0).max(14).nullable(), unavailableDays: z.array(z.number().int().min(0).max(6)).max(7) });

export const DAY_INDEX: Record<string, number> = { lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6 };

export function readWeekConstraint(today: string): WeekConstraint | null {
  const stored = createAppStateRepository().get(WEEK_CONSTRAINT_KEY, constraintSchema);
  return stored && stored.weekStart === startOfIsoWeek(today) ? stored : null;
}

/** Fusionne avec la contrainte de la semaine en cours (un nouveau nombre remplace l'ancien, les jours s'ajoutent). */
export function saveWeekConstraint(today: string, change: { runsThisWeek: number | null; unavailableDays: number[] }): WeekConstraint {
  const current = readWeekConstraint(today);
  const next: WeekConstraint = {
    weekStart: startOfIsoWeek(today),
    runsThisWeek: change.runsThisWeek ?? current?.runsThisWeek ?? null,
    unavailableDays: [...new Set([...(current?.unavailableDays ?? []), ...change.unavailableDays])].sort(),
  };
  createAppStateRepository().set(WEEK_CONSTRAINT_KEY, next);
  return next;
}

export function clearWeekConstraint(): void {
  createAppStateRepository().set(WEEK_CONSTRAINT_KEY, null);
}
