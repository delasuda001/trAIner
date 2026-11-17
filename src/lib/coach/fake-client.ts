import type { LlmClient, StructuredRequest, StructuredResponse } from "./llm";

/**
 * Client simulé pour les essais sur le serveur d'essai (SILLAGE_FAKE_COACH=1) :
 * aucune requête à Claude, une sortie conforme au schéma, sans chiffre (le
 * garde-fou passe), et une consommation fictive pour exercer plafonds et jauge.
 * Jamais activé par défaut.
 */

const FILLER = "Réponse simulée du coach pour les essais : aucun appel à Claude n'a été fait. ";

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; minItems?: number; maxLength?: number; minLength?: number };

function fill(schema: JsonSchema): unknown {
  if (schema.type === "object" && schema.properties) return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, fill(value)]));
  if (schema.type === "array" && schema.items) return Array.from({ length: Math.max(schema.minItems ?? 3, 1) }, () => fill(schema.items as JsonSchema));
  if (schema.type === "integer" || schema.type === "number") return 3;
  if (schema.type === "boolean") return true;
  let text = FILLER;
  while (text.length < (schema.minLength ?? 60)) text += FILLER;
  return text.slice(0, Math.min(schema.maxLength ?? 200, 200)).trim();
}

export function createFakeClient(model: string): LlmClient {
  return {
    name: `simulé (${model})`,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const data = request.schema.parse(fill(request.jsonSchema as JsonSchema));
      return { data, model: `simulé-${model}`, usage: { inputTokens: 8_000, outputTokens: 1_000, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: null, durationMs: 400, models: [model] } };
    },
    lastRateLimit: () => null,
  };
}
