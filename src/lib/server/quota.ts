import "server-only";

import { z } from "zod";
import { getDbFor } from "@/lib/db/client";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { getRegistry, requireActiveMember } from "@/lib/profiles/context";
import { analysesLeft, decideQuota, quotaState, subscriptionGauge, type QuotaDecision, type QuotaState, type SubscriptionGauge } from "@/lib/profiles/quota";
import { simulatedCoachForActive } from "@/lib/profiles/test-profile";
import { DEFAULT_GUESTS_WEEKLY_CAP, type MemberRecord } from "@/lib/profiles/types";
import { readRateLimits } from "./usage";

export const GUESTS_WEEKLY_CAP_KEY = "guests_weekly_cap";

export function guestsWeeklyCap(): number {
  return getRegistry().getSetting(GUESTS_WEEKLY_CAP_KEY, z.number().int().min(0)) ?? DEFAULT_GUESTS_WEEKLY_CAP;
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
export function checkQuota(estimate?: number, options: { preparation?: boolean } = {}): QuotaDecision {
  const member = requireActiveMember();
  const registry = getRegistry();
  const record = registry.find(member.id);
  const now = new Date();
  const since = weekAgo(now);
  // Le profil de test de Bastien n'entame pas le plafond commun des vrais invités.
  const guests = registry.list().filter((entry) => entry.role === "guest" && entry.testOf == null);
  return decideQuota({
    role: member.role,
    dailyCap: record?.dailyTokenCap ?? null,
    weeklyCap: record?.weeklyTokenCap ?? null,
    own: createUsageRepository().since(since),
    allGuests: member.role === "guest" ? guests.flatMap((guest) => usageOf(guest, since)) : [],
    guestsWeeklyCap: guestsWeeklyCap(),
    // Coach simulé du profil de test : aucun appel réel, l'abonnement n'est pas en jeu (plafonds personnels inchangés).
    windows: simulatedCoachForActive() ? [] : windows(),
    now,
    startOfTodayIso: startOfToday(now),
    estimate,
    preparation: options.preparation,
  });
}

function windows() {
  return Object.values(readRateLimits()).map((window) => ({ window: window.window ?? "inconnue", utilization: window.utilization, resetsAt: window.resetsAt, status: window.status }));
}

export type CoachGauge = SubscriptionGauge & {
  /** Analyses encore possibles aujourd'hui pour un invité ; montré seulement à 1 ou 0. */
  left: number | null;
  /** Retour des analyses de l'invité (minuit local) quand il n'en reste plus. */
  guest: boolean;
};

/** État de l'abonnement de Bastien et du plafond de l'invité, pour la jauge près des boutons du coach. */
export function coachGauge(now = new Date()): CoachGauge {
  const member = requireActiveMember();
  const gauge = subscriptionGauge(windows(), now);
  if (member.role !== "guest") return { ...gauge, left: null, guest: false };
  const record = getRegistry().find(member.id);
  const state = quotaState({ own: createUsageRepository().since(weekAgo(now)), dailyCap: record?.dailyTokenCap ?? null, weeklyCap: record?.weeklyTokenCap ?? null, now, startOfTodayIso: startOfToday(now) });
  return { ...gauge, left: analysesLeft(state), guest: true };
}

/** État du quota d'un profil (affichage Paramètres). */
export function quotaStateOf(record: MemberRecord, now = new Date()): QuotaState {
  return quotaState({ own: usageOf(record, weekAgo(now)), dailyCap: record.role === "admin" ? null : record.dailyTokenCap, weeklyCap: record.role === "admin" ? null : record.weeklyTokenCap, now, startOfTodayIso: startOfToday(now) });
}
