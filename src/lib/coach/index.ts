import "server-only";

import { z } from "zod";
import { createAppStateRepository } from "@/lib/db/repositories/app-state-repository";
import { activeMember } from "@/lib/profiles/context";
import { createClaudeAgentClient } from "./claude-agent-client";
import { createFakeClient } from "./fake-client";
import type { LlmClient } from "./llm";

export const COACH_MODELS = ["sonnet", "opus", "haiku"] as const;
export type CoachModel = (typeof COACH_MODELS)[number];
export const COACH_MODEL_KEY = "coach_model";

/** Modèle des invités pendant le test : Sonnet, jamais Opus. */
export const GUEST_COACH_MODEL = "sonnet";

/** Modèle choisi dans les paramètres, sinon CLAUDE_COACH_MODEL, sinon Sonnet. Imposé pour un invité. */
export function currentCoachModel(): string {
  if (activeMember()?.role === "guest") return GUEST_COACH_MODEL;
  const chosen = createAppStateRepository().get(COACH_MODEL_KEY, z.enum(COACH_MODELS));
  return chosen ?? (process.env.CLAUDE_COACH_MODEL?.trim() || "sonnet");
}

const clients = new Map<string, LlmClient>();

/**
 * Point unique de choix du backend LLM. Aujourd'hui : abonnement Claude local
 * via le SDK Agent. Pour passer à une clé API Anthropic plus tard, il suffira
 * d'ajouter ici un second backend (le SDK Agent accepte aussi ANTHROPIC_API_KEY).
 */
export function getLlmClient(): LlmClient {
  const model = currentCoachModel();
  let client = clients.get(model);
  if (!client) {
    // Serveur d'essai uniquement : aucune requête à Claude.
    client = process.env.SILLAGE_FAKE_COACH === "1" ? createFakeClient(model) : createClaudeAgentClient(model);
    clients.set(model, client);
  }
  return client;
}
