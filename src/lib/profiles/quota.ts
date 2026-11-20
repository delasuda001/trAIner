import { budgetTokens, canSpend, TASK_ESTIMATE, type RateWindow } from "@/lib/bench/budget";
import type { MemberRole } from "./types";

/**
 * Plafonds des invités pendant le test familial. Fonctions pures, testées.
 * Bastien (administrateur) n'a pas de plafond ici : son usage est suivi dans
 * Paramètres et son banc garde ses propres plafonds.
 */

export type UsageLike = { createdAt: string; inputTokens: number; outputTokens: number; cacheCreationTokens: number; kind?: string };

/**
 * Préparation d'un profil par Bastien (analyses pré-générées avant la première
 * ouverture) : comptée à part, hors plafonds personnels de l'invité, mais dans le
 * plafond commun des invités et sous la garde de l'abonnement.
 */
export const PREPARE_KIND = "prepare";

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
  /** Appel de préparation lancé par Bastien : les plafonds personnels de l'invité ne s'appliquent pas. */
  preparation?: boolean;
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
  const own = input.own.filter((record) => record.kind !== PREPARE_KIND);
  const usedToday = sum(own, input.startOfTodayIso);
  const usedWeek = sum(own, weekStartIso);
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
  if (!input.preparation && state.remainingToday != null && state.remainingToday < estimate) return deny("Tes analyses du jour sont faites : le coach sera de nouveau disponible demain. Tous tes chiffres restent consultables.");
  if (!input.preparation && state.remainingWeek != null && state.remainingWeek < estimate) return deny("Tu as bien profité du coach cette semaine : il se libère de nouveau au fil des jours. Tous tes chiffres restent consultables.");
  if (input.guestsWeeklyCap != null) {
    const weekStartIso = new Date(input.now.getTime() - 7 * 86_400_000).toISOString();
    if (sum(input.allGuests, weekStartIso) + estimate > input.guestsWeeklyCap) return deny("Le coach a beaucoup servi aux testeurs cette semaine : il fait une pause de quelques jours. Tous tes chiffres restent consultables.");
  }
  // Protège le quota de Bastien : on s'arrête avant que son abonnement sature.
  const windows = canSpend({ estimate: 0, nightUsed: 0, weekUsed: 0, config: { nightTokens: Number.MAX_SAFE_INTEGER, weekTokens: Number.MAX_SAFE_INTEGER, maxUtilization: GUEST_RATE_LIMITS }, windows: input.windows, now: input.now });
  if (!windows.ok) return deny("Le coach fait une pause pour ménager l'abonnement de Bastien : réessaie dans quelques heures. Tous tes chiffres restent consultables.");
  return { allowed: true, ...state };
}

/* ---------- Jauge de l'abonnement de Bastien, montrée aux invités ---------- */

export type GaugeLevel = "large" | "menager" | "plein";

export type SubscriptionGauge = {
  level: GaugeLevel;
  /** Fenêtre la plus chargée par rapport au seuil d'arrêt des invités (0 = vide, 1 = coach en pause). */
  load: number;
  /** Remise à zéro de la fenêtre la plus chargée (ISO), si connue. */
  resetsAt: string | null;
  /** Aucun relevé de l'abonnement encore reçu. */
  known: boolean;
};

/** À partir de 75 % du seuil d'arrêt, on invite à ménager l'abonnement. */
export const GAUGE_EASE_FROM = 0.75;

/**
 * Trois niveaux (large, à ménager, presque plein) : la charge de chaque fenêtre (5 h,
 * 7 jours) rapportée au seuil où le coach s'arrête pour les invités. Fonction pure.
 */
export function subscriptionGauge(windows: RateWindow[], now: Date): SubscriptionGauge {
  let worst: { load: number; resetsAt: string | null } | null = null;
  let known = false;
  for (const window of windows) {
    if (window.resetsAt && new Date(window.resetsAt) <= now) continue;
    known = true;
    const limit = window.window.startsWith("seven_day") ? GUEST_RATE_LIMITS.sevenDay : GUEST_RATE_LIMITS.fiveHour;
    const load = window.status === "rejected" ? 1 : window.utilization == null ? (window.status === "allowed_warning" ? 1 : 0) : (window.utilization > 1 ? window.utilization / 100 : window.utilization) / limit;
    if (!worst || load > worst.load) worst = { load, resetsAt: window.resetsAt };
  }
  const load = worst?.load ?? 0;
  return { level: load >= 1 ? "plein" : load >= GAUGE_EASE_FROM ? "menager" : "large", load: Math.min(1, load), resetsAt: worst?.resetsAt ?? null, known };
}

/** Analyses encore possibles pour un invité (plafonds personnels), ou null sans plafond. */
export function analysesLeft(state: QuotaState, estimate = TASK_ESTIMATE.generation): number | null {
  const remaining = [state.remainingToday, state.remainingWeek].filter((value): value is number => value != null);
  return remaining.length ? Math.floor(Math.min(...remaining) / estimate) : null;
}
