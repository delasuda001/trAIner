import "server-only";

import { getLlmClient } from "@/lib/coach";
import type { LlmUsage } from "@/lib/coach/llm";
import { getDbFor } from "@/lib/db/client";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { adminMember, getRegistry } from "@/lib/profiles/context";
import { LlmError } from "@/lib/coach/llm";
import { fetchPlanWindows } from "@/lib/coach/claude-agent-client";
import { mergeRateWindows } from "@/lib/coach/rate-limits";
import { z } from "zod";

const storedRateLimitSchema = z.record(z.string(), z.object({ status: z.string(), window: z.string().nullable(), utilization: z.number().nullable(), resetsAt: z.string().nullable(), seenAt: z.string() }));

const lastRateLimitSchema = z.object({ status: z.string(), window: z.string().nullable(), utilization: z.number().nullable(), resetsAt: z.string().nullable(), seenAt: z.string() });

/**
 * Dernier état connu de chaque fenêtre de quota (persisté entre les lancements).
 * C'est l'abonnement de Bastien, commun à tous les profils : il vit dans le
 * registre ; l'ancien emplacement (base de Bastien) sert de repli.
 */
export function readRateLimits(): z.infer<typeof storedRateLimitSchema> {
  return getRegistry().getSetting(RATE_LIMITS_KEY, storedRateLimitSchema) ?? createAppStateRepository(getDbFor(adminMember())).get(RATE_LIMITS_KEY, storedRateLimitSchema) ?? {};
}

export function readLastRateLimit(): z.infer<typeof lastRateLimitSchema> | null {
  return getRegistry().getSetting(RATE_LIMIT_KEY, lastRateLimitSchema) ?? createAppStateRepository(getDbFor(adminMember())).get(RATE_LIMIT_KEY, lastRateLimitSchema);
}
import { createUsageRepository, type UsageKind, type UsageOutcome } from "@/lib/db/repositories/usage-repository";

export const RATE_LIMIT_KEY = "claude_rate_limit";
/** Toutes les fenêtres de quota vues, par nom de fenêtre. */
export const RATE_LIMITS_KEY = "claude_rate_limits";
/** Heure du dernier relevé complet de l'abonnement réussi (toutes fenêtres, en pourcentage). */
export const RATE_LIMITS_CHECKED_KEY = "claude_rate_limits_checked_at";

/** Un relevé de moins de 5 minutes suffit pour la jauge des invités. */
export const RATE_LIMITS_TTL_MS = 5 * 60_000;

export function rateLimitsCheckedAt(): string | null {
  return getRegistry().getSetting(RATE_LIMITS_CHECKED_KEY, z.string());
}

let inFlight: Promise<boolean> | null = null;

/**
 * Relève l'abonnement de Bastien si le dernier relevé date de plus de `maxAgeMs`.
 * Sans token (voir `fetchPlanWindows`), un seul relevé à la fois, jamais d'exception :
 * en cas d'échec ou de délai, on garde l'état connu. Rend true si l'état est frais.
 * Coach simulé (serveur d'essai) : rien n'est relevé.
 */
export async function refreshRateLimits(options: { maxAgeMs?: number; waitMs?: number } = {}): Promise<boolean> {
  if (process.env.SILLAGE_FAKE_COACH === "1") return false;
  const maxAgeMs = options.maxAgeMs ?? RATE_LIMITS_TTL_MS;
  const checkedAt = rateLimitsCheckedAt();
  if (checkedAt && Date.now() - Date.parse(checkedAt) < maxAgeMs) return true;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const windows = await fetchPlanWindows();
        if (!windows) return false;
        const now = new Date().toISOString();
        getRegistry().setSetting(RATE_LIMITS_KEY, mergeRateWindows(readRateLimits(), windows, now));
        getRegistry().setSetting(RATE_LIMITS_CHECKED_KEY, now);
        return true;
      } catch (error) {
        console.warn(`[coach] relevé de l'abonnement impossible : ${(error as Error).message}`);
        return false;
      } finally {
        inFlight = null;
      }
    })();
  }
  const pending = inFlight;
  if (options.waitMs == null) return pending;
  // Attente bornée : la page s'affiche avec l'état connu si le relevé tarde.
  return Promise.race([pending, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), options.waitMs))]);
}

/** Enregistre la consommation d'un appel ; ne fait jamais échouer l'appel lui-même. */
export function recordUsage(kind: UsageKind, subject: string | null, model: string, outcome: UsageOutcome, usage: LlmUsage | null): void {
  if (!usage) return;
  try {
    createUsageRepository().record({ kind, subject, model, outcome, usage });
    // Dernier état de quota communiqué par l'abonnement (s'il y en a un), pour la page Paramètres.
    const rateLimit = getLlmClient().lastRateLimit();
    if (rateLimit) getRegistry().setSetting(RATE_LIMIT_KEY, { ...rateLimit, seenAt: new Date().toISOString() });
    // Seul l'événement de CET appel : un ancien événement gardé en mémoire ne doit pas passer pour frais.
    if (rateLimit) {
      getRegistry().setSetting(RATE_LIMITS_KEY, mergeRateWindows(readRateLimits(), [rateLimit], new Date().toISOString()));
      // Après un appel réel, relevé complet en arrière-plan (sans token) : la jauge suit la consommation.
      void refreshRateLimits({ maxAgeMs: 0 });
    }
  } catch (error) {
    console.warn(`[coach] suivi de consommation impossible : ${(error as Error).message}`);
  }
}

/** Consommation d'un appel en échec, quand le modèle a tout de même répondu. */
export function recordFailure(kind: UsageKind, subject: string | null, model: string, error: unknown): void {
  if (error instanceof LlmError && error.usage) recordUsage(kind, subject, model, error.kind === "invalid_output" ? "rejected" : "error", error.usage);
}
