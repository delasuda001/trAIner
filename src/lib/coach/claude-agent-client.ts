import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { LlmError, type LlmClient, type LlmRateLimit, type LlmUsage, type StructuredRequest, type StructuredResponse } from "./llm";
import { windowsFromPlanUsage } from "./rate-limits";

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
    if (key.startsWith("CLAUDE_CODE") || key === "CLAUDECODE" || key === "ANTHROPIC_API_KEY" || key.startsWith("GARMIN_API_KEY") || key === "SESSION_SECRET") continue;
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

/** État de quota communiqué par le dernier appel (remis à zéro au début de chaque appel). */
let lastRateLimit: LlmRateLimit | null = null;

/** Prompt qui n'envoie jamais rien : le CLI démarre, répond aux demandes de contrôle, et aucun modèle n'est appelé. */
async function* silentPrompt(signal: AbortSignal): AsyncGenerator<never> {
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

/**
 * Relevé de l'abonnement (fenêtres 5 h, 7 jours…) tel que `/usage` l'affiche : lu sur le
 * compte claude.ai par le CLI, SANS appel de modèle ni token consommé (≈ 1 s). Null si
 * indisponible. API marquée expérimentale par le SDK : tout échec est sans conséquence
 * (on garde le dernier relevé et l'affichage devient prudent).
 */
export async function fetchPlanWindows(timeoutMs = 8_000): Promise<LlmRateLimit[] | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const stream = query({ prompt: silentPrompt(abort.signal), options: { tools: [], settingSources: [], persistSession: false, env: cleanEnvironment(), abortController: abort } });
  try {
    const timeout = new Promise<null>((resolve) => abort.signal.addEventListener("abort", () => resolve(null), { once: true }));
    const response = await Promise.race([stream.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), timeout]);
    return response ? windowsFromPlanUsage(response) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    abort.abort();
    stream.close();
  }
}

export function createClaudeAgentClient(model: string): LlmClient {
  return {
    name: `claude-agent-sdk:${model}`,
    lastRateLimit: () => lastRateLimit,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      let usedModel = model;
      let assistantError: string | undefined;
      lastRateLimit = null;
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
            lastRateLimit = { status: info.status, window: info.rateLimitType ?? null, utilization: info.utilization == null ? null : info.utilization > 1 ? info.utilization / 100 : info.utilization, resetsAt: info.resetsAt ? new Date(info.resetsAt * (info.resetsAt < 1e12 ? 1000 : 1)).toISOString() : null };
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
