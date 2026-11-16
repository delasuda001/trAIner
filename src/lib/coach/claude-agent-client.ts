import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { LlmError, type LlmClient, type LlmRateLimit, type LlmUsage, type StructuredRequest, type StructuredResponse } from "./llm";

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

/** Chiffres de consommation renvoyés par le SDK dans le message de résultat. */
function usageOf(result: SDKResultMessage): LlmUsage {
  // Le modèle principal d'abord (celui qui a produit la réponse) ; les appels internes plus légers ensuite.
  const models = Object.entries(result.modelUsage ?? {}).sort((a, b) => b[1].outputTokens - a[1].outputTokens);
  const sum = (pick: (usage: (typeof models)[number][1]) => number) => models.reduce((total, [, usage]) => total + (pick(usage) ?? 0), 0);
  return {
    inputTokens: sum((usage) => usage.inputTokens),
    outputTokens: sum((usage) => usage.outputTokens),
    cacheReadTokens: sum((usage) => usage.cacheReadInputTokens),
    cacheCreationTokens: sum((usage) => usage.cacheCreationInputTokens),
    costUsd: typeof result.total_cost_usd === "number" ? result.total_cost_usd : null,
    durationMs: typeof result.duration_ms === "number" ? result.duration_ms : null,
    models: models.map(([name]) => name),
  };
}

let lastRateLimit: LlmRateLimit | null = null;

export function createClaudeAgentClient(model: string): LlmClient {
  return {
    name: `claude-agent-sdk:${model}`,
    lastRateLimit: () => lastRateLimit,
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
          if (message.type === "rate_limit_event") {
            const info = message.rate_limit_info;
            lastRateLimit = { status: info.status, window: info.rateLimitType ?? null, utilization: info.utilization ?? null, resetsAt: info.resetsAt ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toISOString() : null };
          }
          if (message.type === "result") {
            const usage = usageOf(message);
            const fail = (error: LlmError) => { error.usage = usage; return error; };
            if (message.subtype !== "success") throw fail(classify(assistantError, message.subtype));
            if (message.is_error) throw fail(classify(assistantError, message.result ?? ""));
            const parsed = request.schema.safeParse(message.structured_output);
            if (!parsed.success) throw fail(new LlmError("invalid_output", parsed.error.message.slice(0, 500)));
            return { data: parsed.data, model: usedModel, usage };
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
