import "server-only";

import { z } from "zod";
import { getDbFor } from "@/lib/db/client";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { getRegistry, requireActiveMember } from "@/lib/profiles/context";
import { decideQuota, quotaState, type QuotaDecision, type QuotaState } from "@/lib/profiles/quota";
import { DEFAULT_GUESTS_WEEKLY_CAP, type MemberRecord } from "@/lib/profiles/types";
import { readRateLimits } from "./usage";

export const GUESTS_WEEKLY_CAP_KEY = "guests_weekly_cap";

export function guestsWeeklyCap(): number | null {
  const stored = getRegistry().getSetting(GUESTS_WEEKLY_CAP_KEY, z.number().int().min(0).nullable());
  return stored === null ? DEFAULT_GUESTS_WEEKLY_CAP : stored;
}

function startOfToday(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function weekAgo(now: Date): string {
  return new Date(now.getTime() - 7 * 86_400_000).toISOString();
}

/** Consommation d'un profil, lue dans SA base (vue administrateur et contrôle des plafonds). */
export function usageOf(record: Pick<MemberRecord, "id" | "role">, sinceIso: string) {
  return createUsageRepository(getDbFor(record)).since(sinceIso);
}

/** Contrôle avant tout appel à Claude (après le cache : une réponse en cache ne coûte rien). */
export function checkQuota(estimate?: number): QuotaDecision {
  const member = requireActiveMember();
  const registry = getRegistry();
  const record = registry.find(member.id);
  const now = new Date();
  const since = weekAgo(now);
  const guests = registry.list().filter((entry) => entry.role === "guest");
  return decideQuota({
    role: member.role,
    dailyCap: record?.dailyTokenCap ?? null,
    weeklyCap: record?.weeklyTokenCap ?? null,
    own: createUsageRepository().since(since),
    allGuests: member.role === "guest" ? guests.flatMap((guest) => usageOf(guest, since)) : [],
    guestsWeeklyCap: guestsWeeklyCap(),
    windows: Object.values(readRateLimits()).map((window) => ({ window: window.window ?? "inconnue", utilization: window.utilization, resetsAt: window.resetsAt, status: window.status })),
    now,
    startOfTodayIso: startOfToday(now),
    estimate,
  });
}

/** État du quota d'un profil (affichage Paramètres). */
export function quotaStateOf(record: MemberRecord, now = new Date()): QuotaState {
  return quotaState({ own: usageOf(record, weekAgo(now)), dailyCap: record.role === "admin" ? null : record.dailyTokenCap, weeklyCap: record.role === "admin" ? null : record.weeklyTokenCap, now, startOfTodayIso: startOfToday(now) });
}
