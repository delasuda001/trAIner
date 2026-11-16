import { budgetTokens, canSpend, TASK_ESTIMATE, type RateWindow } from "@/lib/bench/budget";
import type { MemberRole } from "./types";

/**
 * Plafonds des invités pendant le test familial. Fonctions pures, testées.
 * Bastien (administrateur) n'a pas de plafond ici : son usage est suivi dans
 * Paramètres et son banc garde ses propres plafonds.
 */

export type UsageLike = { createdAt: string; inputTokens: number; outputTokens: number; cacheCreationTokens: number };

export type QuotaInput = {
  role: MemberRole;
  dailyCap: number | null;
  weeklyCap: number | null;
  /** Appels de CE profil sur au moins 7 jours. */
  own: UsageLike[];
  /** Appels de TOUS les invités sur au moins 7 jours. */
  allGuests: UsageLike[];
  guestsWeeklyCap: number | null;
  windows: RateWindow[];
  now: Date;
  /** Début du jour local (minuit), en ISO. */
  startOfTodayIso: string;
  estimate?: number;
};

export type QuotaState = {
  usedToday: number;
  usedWeek: number;
  remainingToday: number | null;
  remainingWeek: number | null;
};

export type QuotaDecision = ({ allowed: true } | { allowed: false; message: string }) & QuotaState;

export const GUEST_RATE_LIMITS = { fiveHour: 0.6, sevenDay: 0.7 } as const;

function sum(records: UsageLike[], sinceIso: string): number {
  return records.filter((record) => record.createdAt >= sinceIso).reduce((total, record) => total + budgetTokens(record), 0);
}

export function quotaState(input: Pick<QuotaInput, "own" | "dailyCap" | "weeklyCap" | "now" | "startOfTodayIso">): QuotaState {
  const weekStartIso = new Date(input.now.getTime() - 7 * 86_400_000).toISOString();
  const usedToday = sum(input.own, input.startOfTodayIso);
  const usedWeek = sum(input.own, weekStartIso);
  return {
    usedToday,
    usedWeek,
    remainingToday: input.dailyCap == null ? null : Math.max(0, input.dailyCap - usedToday),
    remainingWeek: input.weeklyCap == null ? null : Math.max(0, input.weeklyCap - usedWeek),
  };
}

/** Un appel est permis si l'estimation tient dans chaque plafond restant. */
export function decideQuota(input: QuotaInput): QuotaDecision {
  const state = quotaState(input);
  if (input.role === "admin") return { allowed: true, ...state };
  const estimate = input.estimate ?? TASK_ESTIMATE.generation;
  const deny = (message: string): QuotaDecision => ({ allowed: false, message, ...state });
  if (state.remainingToday != null && state.remainingToday < estimate) return deny("Limite d'analyses du jour atteinte pour le test. Les chiffres restent affichés ; le coach sera de nouveau disponible demain.");
  if (state.remainingWeek != null && state.remainingWeek < estimate) return deny("Limite d'analyses de la semaine atteinte pour le test. Les chiffres restent affichés ; le coach se libère au fil des jours.");
  if (input.guestsWeeklyCap != null) {
    const weekStartIso = new Date(input.now.getTime() - 7 * 86_400_000).toISOString();
    if (sum(input.allGuests, weekStartIso) + estimate > input.guestsWeeklyCap) return deny("Le coach est en pause pour les testeurs cette semaine (plafond commun atteint). Les chiffres restent affichés.");
  }
  // Protège le quota de Bastien : on s'arrête avant que son abonnement sature.
  const windows = canSpend({ estimate: 0, nightUsed: 0, weekUsed: 0, config: { nightTokens: Number.MAX_SAFE_INTEGER, weekTokens: Number.MAX_SAFE_INTEGER, maxUtilization: GUEST_RATE_LIMITS }, windows: input.windows, now: input.now });
  if (!windows.ok) return deny("Le coach est très sollicité en ce moment : réessaie dans quelques heures. Les chiffres restent affichés.");
  return { allowed: true, ...state };
}
