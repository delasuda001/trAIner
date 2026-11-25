import "server-only";

import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { featureEnabled } from "@/lib/env/environment";

/** Option choisie (plan B ou C) pour la prochaine séance, gardée jusqu'à la date de cette séance. */
export const SESSION_CHOICE_KEY = "session_choice";

const choiceSchema = z.object({ key: z.string().max(40), date: z.string() });

export function readSessionChoice(today: string): string | null {
  if (!featureEnabled("session_options")) return null;
  const stored = createAppStateRepository().get(SESSION_CHOICE_KEY, choiceSchema);
  return stored && stored.date >= today ? stored.key : null;
}

export function saveSessionChoice(key: string | null, date: string): void {
  createAppStateRepository().set(SESSION_CHOICE_KEY, key ? { key, date } : null);
}
