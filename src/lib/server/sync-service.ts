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

/**
 * Invités (gros volume possible) : 12 mois d'activités, 120 jours de bien-être, séries
 * détaillées des 12 dernières semaines ; les plus anciennes sont chargées à l'ouverture.
 */
const GUEST_HISTORY_MONTHS = 12;
const GUEST_WELLNESS_DAYS = 120;
const GUEST_DETAIL_WEEKS = 12;

export function syncOptionsFor(member: Member, now = new Date(), detailBudget = 40): SyncOptions {
  if (member.role === "admin") return { detailBudget };
  const historyStart = new Date(now);
  historyStart.setMonth(historyStart.getMonth() - GUEST_HISTORY_MONTHS);
  return { detailBudget, historyStart, wellnessBackfillDays: GUEST_WELLNESS_DAYS, detailSince: new Date(now.getTime() - GUEST_DETAIL_WEEKS * 7 * 86_400_000) };
}

function sourceFor(member: Member) {
  reloadEnv();
  return getGarminSource(getRegistry().find(member.id)?.garminEnvVar ?? "GARMIN_API_KEY");
}

/** Séries d'une séance ancienne restée en attente, chargées quand on l'ouvre (profil actif). */
export async function fetchDetailNow(member: Member, activityId: string): Promise<boolean> {
  const repository = createActivityRepository();
  const row = repository.findById(activityId);
  if (!row || row.detailStatus !== "pending") return false;
  try {
    repository.saveDetail(row.id, await sourceFor(member).getActivityDetail(row.sourceId, row.sourceType));
    return true;
  } catch {
    repository.setDetailStatus(row.id, "failed");
    return false;
  }
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
  const task = runSync(
    { source: sourceFor(member), activities: createActivityRepository(), wellness: createWellnessRepository(), state: createAppStateRepository() },
    syncOptionsFor(member, new Date(), detailBudget),
  ).finally(() => inFlight.delete(member.id));
  inFlight.set(member.id, task);
  return task;
}
