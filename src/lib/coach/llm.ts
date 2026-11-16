import type { z } from "zod";

/**
 * Interface étroite entre l'application et un modèle de langage. Les appelants
 * ne connaissent que `generateStructured` : brancher plus tard un backend
 * « clé API Anthropic » ne change que la fabrique `getLlmClient`.
 */

export type StructuredRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** JSON Schema équivalent, imposé au modèle. */
  jsonSchema: Record<string, unknown>;
};

/** Consommation d'un appel, telle que renvoyée par le backend (aucune estimation maison). */
export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Coût équivalent API indiqué par le SDK (indicatif : l'abonnement n'est pas facturé à l'appel). */
  costUsd: number | null;
  durationMs: number | null;
  models: string[];
};

/** État du quota de l'abonnement, quand le backend le communique. */
export type LlmRateLimit = { status: string; window: string | null; utilization: number | null; resetsAt: string | null };

export type StructuredResponse<T> = { data: T; model: string; usage: LlmUsage | null };

export type LlmClient = {
  readonly name: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>>;
  /** Dernier état de quota observé (abonnement), ou null si le backend n'en fournit pas. */
  lastRateLimit(): LlmRateLimit | null;
};

export type LlmFailureKind = "rate_limited" | "unavailable" | "auth" | "invalid_output";

export class LlmError extends Error {
  /** Consommation de l'appel quand il a abouti côté modèle (ex. réponse refusée par la validation). */
  usage: LlmUsage | null = null;
  constructor(readonly kind: LlmFailureKind, message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export const LLM_FAILURE_MESSAGES: Record<LlmFailureKind, string> = {
  rate_limited: "Quota Claude atteint pour le moment : l'analyse chiffrée reste affichée, réessaie plus tard.",
  unavailable: "Claude ne répond pas : l'analyse chiffrée reste affichée.",
  auth: "Claude n'est pas connecté sur cette machine : lance `claude` une fois dans un terminal pour te connecter.",
  invalid_output: "La réponse de Claude n'a pas passé les contrôles (format ou chiffres) : l'analyse chiffrée reste affichée.",
};
