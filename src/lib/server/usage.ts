import "server-only";

import { getLlmClient } from "@/lib/coach";
import type { LlmUsage } from "@/lib/coach/llm";
import { getDbFor } from "@/lib/db/client";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { adminMember, getRegistry } from "@/lib/profiles/context";
import { LlmError } from "@/lib/coach/llm";
import { observedRateLimits } from "@/lib/coach/claude-agent-client";
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

/** Enregistre la consommation d'un appel ; ne fait jamais échouer l'appel lui-même. */
export function recordUsage(kind: UsageKind, subject: string | null, model: string, outcome: UsageOutcome, usage: LlmUsage | null): void {
  if (!usage) return;
  try {
    createUsageRepository().record({ kind, subject, model, outcome, usage });
    // Dernier état de quota communiqué par l'abonnement (s'il y en a un), pour la page Paramètres.
    const rateLimit = getLlmClient().lastRateLimit();
    if (rateLimit) getRegistry().setSetting(RATE_LIMIT_KEY, { ...rateLimit, seenAt: new Date().toISOString() });
    const windows = observedRateLimits();
    if (windows.length) {
      const stored = readRateLimits();
      for (const window of windows) stored[window.window ?? "inconnue"] = { ...window, seenAt: new Date().toISOString() };
      getRegistry().setSetting(RATE_LIMITS_KEY, stored);
    }
  } catch (error) {
    console.warn(`[coach] suivi de consommation impossible : ${(error as Error).message}`);
  }
}

/** Consommation d'un appel en échec, quand le modèle a tout de même répondu. */
export function recordFailure(kind: UsageKind, subject: string | null, model: string, error: unknown): void {
  if (error instanceof LlmError && error.usage) recordUsage(kind, subject, model, error.kind === "invalid_output" ? "rejected" : "error", error.usage);
}
