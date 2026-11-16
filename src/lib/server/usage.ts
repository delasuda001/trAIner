import "server-only";

import { getLlmClient } from "@/lib/coach";
import type { LlmUsage } from "@/lib/coach/llm";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { LlmError } from "@/lib/coach/llm";
import { createUsageRepository, type UsageKind, type UsageOutcome } from "@/lib/db/repositories/usage-repository";

export const RATE_LIMIT_KEY = "claude_rate_limit";

/** Enregistre la consommation d'un appel ; ne fait jamais échouer l'appel lui-même. */
export function recordUsage(kind: UsageKind, subject: string | null, model: string, outcome: UsageOutcome, usage: LlmUsage | null): void {
  if (!usage) return;
  try {
    createUsageRepository().record({ kind, subject, model, outcome, usage });
    // Dernier état de quota communiqué par l'abonnement (s'il y en a un), pour la page Paramètres.
    const rateLimit = getLlmClient().lastRateLimit();
    if (rateLimit) createAppStateRepository().set(RATE_LIMIT_KEY, { ...rateLimit, seenAt: new Date().toISOString() });
  } catch (error) {
    console.warn(`[coach] suivi de consommation impossible : ${(error as Error).message}`);
  }
}

/** Consommation d'un appel en échec, quand le modèle a tout de même répondu. */
export function recordFailure(kind: UsageKind, subject: string | null, model: string, error: unknown): void {
  if (error instanceof LlmError && error.usage) recordUsage(kind, subject, model, error.kind === "invalid_output" ? "rejected" : "error", error.usage);
}
