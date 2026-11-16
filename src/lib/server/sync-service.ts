import "server-only";

import { loadEnvConfig } from "@next/env";
import { createActivityRepository } from "@/lib/db/repositories/activity-repository";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { createWellnessRepository } from "@/lib/db/repositories/wellness-repository";
import { getRegistry } from "@/lib/profiles/context";
import type { Member } from "@/lib/profiles/types";
import { getGarminSource } from "@/lib/source/garmin";
import { runSync, type SyncOptions, type SyncResult } from "@/lib/sync/sync";

const globalForSync = globalThis as typeof globalThis & { sillageSyncInFlight?: Map<string, Promise<SyncResult>> };

/**
 * Relit `.env.local` : une clé Garmin ajoutée pour un invité est prise en compte
 * sans relancer l'application. Les variables du shell restent prioritaires.
 */
export function reloadEnv(): void {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => undefined, error: () => undefined }, true);
}

/** Premier import d'un invité : 18 mois d'activités, 120 jours de bien-être (un gros volume reste léger). */
const GUEST_HISTORY_MONTHS = 18;
const GUEST_WELLNESS_DAYS = 120;

export function syncOptionsFor(member: Member, now = new Date(), detailBudget = 40): SyncOptions {
  if (member.role === "admin") return { detailBudget };
  const historyStart = new Date(now);
  historyStart.setMonth(historyStart.getMonth() - GUEST_HISTORY_MONTHS);
  return { detailBudget, historyStart, wellnessBackfillDays: GUEST_WELLNESS_DAYS };
}

/**
 * Synchronisation du profil actif (appelé sous `runAs`). Une seule à la fois par
 * profil : un second appel concurrent attend la première.
 */
export function syncNow(member: Member, detailBudget = 40): Promise<SyncResult> {
  globalForSync.sillageSyncInFlight ??= new Map();
  const inFlight = globalForSync.sillageSyncInFlight;
  const running = inFlight.get(member.id);
  if (running) return running;
  reloadEnv();
  const envVar = getRegistry().find(member.id)?.garminEnvVar ?? "GARMIN_API_KEY";
  const task = runSync(
    { source: getGarminSource(envVar), activities: createActivityRepository(), wellness: createWellnessRepository(), state: createAppStateRepository() },
    syncOptionsFor(member, new Date(), detailBudget),
  ).finally(() => inFlight.delete(member.id));
  inFlight.set(member.id, task);
  return task;
}
