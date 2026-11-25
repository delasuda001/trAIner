import "server-only";

import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { sessionKudos, type Kudos } from "@/lib/engine/kudos";
import { sessionTitle } from "@/lib/engine/activity-metrics";
import type { Dashboard } from "./analytics";

export const KUDOS_SEEN_KEY = "kudos_seen_activity";

/** Félicitations dues pour la dernière séance du profil (null si déjà vues, trop anciennes ou séance facile). */
export function kudosFor(dashboard: Dashboard): Kudos | null {
  const last = dashboard.lastRun;
  if (!last) return null;
  const seen = createAppStateRepository().get(KUDOS_SEEN_KEY, z.string());
  return sessionKudos({
    id: last.activity.id,
    localDate: last.activity.localDate,
    kind: last.metrics.kind,
    title: sessionTitle(last.metrics),
    distanceM: last.activity.distanceM,
    movingTimeS: last.activity.movingTimeS,
    aerobicTrainingEffect: last.activity.aerobicTrainingEffect,
    perceivedEffort: last.feeling?.perceivedEffort ?? null,
  }, dashboard.today, seen);
}
