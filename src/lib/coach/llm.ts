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

export type StructuredResponse<T> = { data: T; model: string };

export type LlmClient = {
  readonly name: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>>;
};

export type LlmFailureKind = "rate_limited" | "unavailable" | "auth" | "invalid_output";

export class LlmError extends Error {
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
