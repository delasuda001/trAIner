import "server-only";

import { createHash } from "node:crypto";
import { createClaudeAgentClient } from "@/lib/coach/claude-agent-client";
import { buildFeedbackPrompt, FEEDBACK_PROMPT_VERSION, FEEDBACK_SYSTEM_PROMPT, feedbackSynthesisJsonSchema, feedbackSynthesisSchema, type FeedbackSynthesis } from "@/lib/coach/feedback-synthesis";
import { LLM_FAILURE_MESSAGES, LlmError } from "@/lib/coach/llm";
import { createCoachOutputRepository } from "@/lib/db/repositories/coach-output-repository";
import { digestFeedback, digestMarkdown } from "@/lib/feedback/digest";
import { getRegistry, requireActiveMember } from "@/lib/profiles/context";
import { recordFailure, recordUsage } from "./usage";

/** Retours de tous les testeurs et leur export Markdown (vue de Bastien uniquement). */
export function feedbackOverview(filter: { profileId?: string } = {}) {
  const registry = getRegistry();
  const names = new Map(registry.list().map((record) => [record.id, record.name]));
  const records = registry.listFeedback(filter);
  const digest = digestFeedback(records);
  return { records, digest, names, markdown: digestMarkdown(digest, names, new Date().toISOString()) };
}

export type SynthesisResult = { status: "ready"; output: FeedbackSynthesis; createdAt: string; stale: boolean } | { status: "missing" } | { status: "error"; message: string };

function hashOf(markdown: string): string {
  // La date de l'export n'entre pas dans l'empreinte : seuls les retours comptent.
  return createHash("sha256").update(FEEDBACK_PROMPT_VERSION).update(markdown.split("\n").slice(1).join("\n")).digest("hex").slice(0, 32);
}

/** Dernière synthèse (lecture seule, jamais d'appel au chargement). */
export function readSynthesis(markdown: string): SynthesisResult {
  const latest = createCoachOutputRepository().latest("feedback", "all");
  if (!latest) return { status: "missing" };
  const parsed = feedbackSynthesisSchema.safeParse(JSON.parse(latest.outputJson));
  return parsed.success ? { status: "ready", output: parsed.data, createdAt: latest.createdAt, stale: latest.inputHash !== hashOf(markdown) } : { status: "missing" };
}

/** Synthèse par Claude (Sonnet), sur bouton ; réutilise la dernière si les retours n'ont pas changé. */
export async function generateSynthesis(): Promise<SynthesisResult> {
  if (requireActiveMember().role !== "admin") return { status: "error", message: "Réservé à l'administrateur." };
  const { markdown, digest } = feedbackOverview();
  if (!digest.total) return { status: "error", message: "Aucun retour à synthétiser." };
  const current = readSynthesis(markdown);
  if (current.status === "ready" && !current.stale) return current;
  const client = createClaudeAgentClient("sonnet");
  try {
    const response = await client.generateStructured({ system: FEEDBACK_SYSTEM_PROMPT, prompt: buildFeedbackPrompt(markdown), schema: feedbackSynthesisSchema, jsonSchema: feedbackSynthesisJsonSchema as unknown as Record<string, unknown> });
    recordUsage("feedback", null, response.model, "ok", response.usage);
    const row = createCoachOutputRepository().save({ kind: "feedback", subject: "all", inputHash: hashOf(markdown), model: response.model, promptVersion: FEEDBACK_PROMPT_VERSION, output: response.data });
    return { status: "ready", output: response.data, createdAt: row.createdAt, stale: false };
  } catch (error) {
    recordFailure("feedback", null, client.name, error);
    return { status: "error", message: error instanceof LlmError ? LLM_FAILURE_MESSAGES[error.kind] : "Claude ne répond pas." };
  }
}
