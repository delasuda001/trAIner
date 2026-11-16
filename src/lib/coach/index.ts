import "server-only";

import { createClaudeAgentClient } from "./claude-agent-client";
import type { LlmClient } from "./llm";

let client: LlmClient | null = null;

/**
 * Point unique de choix du backend LLM. Aujourd'hui : abonnement Claude local
 * via le SDK Agent. Pour passer à une clé API Anthropic plus tard, il suffira
 * d'ajouter ici un second backend (le SDK Agent accepte aussi ANTHROPIC_API_KEY).
 */
export function getLlmClient(): LlmClient {
  client ??= createClaudeAgentClient(process.env.CLAUDE_COACH_MODEL?.trim() || "sonnet");
  return client;
}
