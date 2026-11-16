import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { LlmError, type LlmClient, type StructuredRequest, type StructuredResponse } from "./llm";

/**
 * Backend « abonnement Claude local » : le SDK Agent pilote le CLI Claude Code
 * déjà connecté au compte claude.ai de l'utilisateur. Aucune clé API.
 * Aucun outil, aucun réglage de projet chargé, aucune session persistée :
 * Claude ne fait que lire la charge utile et répondre au format imposé.
 */

const TIMEOUT_MS = 120_000;

function cleanEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    // On écarte les variables d'une éventuelle session Claude Code parente et toute clé API :
    // l'appel doit passer par la connexion claude.ai.
    if (key.startsWith("CLAUDE_CODE") || key === "CLAUDECODE" || key === "ANTHROPIC_API_KEY" || key === "GARMIN_API_KEY") continue;
    env[key] = value;
  }
  return env;
}

function classify(error: string | undefined, text: string): LlmError {
  const lower = `${error ?? ""} ${text}`.toLowerCase();
  if (lower.includes("rate_limit") || lower.includes("rate limit") || lower.includes("usage limit") || lower.includes("limit reached")) return new LlmError("rate_limited", "Quota Claude atteint");
  if (lower.includes("authentication") || lower.includes("not logged in") || lower.includes("oauth") || lower.includes("login")) return new LlmError("auth", "Claude non connecté");
  return new LlmError("unavailable", text.slice(0, 300) || "Claude indisponible");
}

export function createClaudeAgentClient(model: string): LlmClient {
  return {
    name: `claude-agent-sdk:${model}`,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      let usedModel = model;
      let assistantError: string | undefined;
      try {
        const stream = query({
          prompt: request.prompt,
          options: {
            model,
            systemPrompt: request.system,
            tools: [],
            settingSources: [],
            persistSession: false,
            maxTurns: 3,
            env: cleanEnvironment(),
            abortController: abort,
            outputFormat: { type: "json_schema", schema: request.jsonSchema },
          },
        });
        for await (const message of stream) {
          if (message.type === "system" && message.subtype === "init") usedModel = message.model;
          if (message.type === "assistant" && message.error) assistantError = message.error;
          if (message.type === "result") {
            if (message.subtype !== "success") throw classify(assistantError, message.subtype);
            if (message.is_error) throw classify(assistantError, message.result ?? "");
            const parsed = request.schema.safeParse(message.structured_output);
            if (!parsed.success) throw new LlmError("invalid_output", parsed.error.message.slice(0, 500));
            return { data: parsed.data, model: usedModel };
          }
        }
        throw classify(assistantError, "Réponse Claude incomplète");
      } catch (error) {
        if (error instanceof LlmError) throw error;
        throw classify(assistantError, error instanceof Error ? error.message : String(error));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
