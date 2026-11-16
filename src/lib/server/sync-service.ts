import "server-only";

import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";
import { getGarminSource } from "@/lib/source/garmin";
import { runSync, type SyncResult } from "@/lib/sync/sync";

const globalForSync = globalThis as typeof globalThis & { trainerSyncInFlight?: Promise<SyncResult> };

/** Une seule synchronisation à la fois : un second appel concurrent attend la première. */
export function syncNow(detailBudget = 40): Promise<SyncResult> {
  if (!globalForSync.trainerSyncInFlight) {
    globalForSync.trainerSyncInFlight = runSync(
      { source: getGarminSource(), activities: createActivityRepository(), wellness: createWellnessRepository(), state: createAppStateRepository() },
      { detailBudget },
    ).finally(() => {
      globalForSync.trainerSyncInFlight = undefined;
    });
  }
  return globalForSync.trainerSyncInFlight;
}
