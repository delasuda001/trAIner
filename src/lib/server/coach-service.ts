import "server-only";

import { createHash } from "node:crypto";
import type { z } from "zod";
import { getLlmClient } from "@/lib/coach";
import { LLM_FAILURE_MESSAGES, LlmError, type LlmFailureKind } from "@/lib/coach/llm";
import { allowedNumbers, collectText, findUnsupportedNumbers } from "@/lib/coach/number-guard";
import { buildOutlookPayload, buildOutlookPrompt, OUTLOOK_PROMPT_VERSION, OUTLOOK_SYSTEM_PROMPT, outlookCoachJsonSchema, outlookCoachSchema, type OutlookCoachOutput } from "@/lib/coach/outlook-coach";
import { buildSessionPayload, buildSessionPrompt, SESSION_PROMPT_VERSION, SESSION_SYSTEM_PROMPT, sessionCoachJsonSchema, sessionCoachSchema, type SessionCoachOutput } from "@/lib/coach/session-coach";
import { createCoachOutputRepository } from "@/lib/db/repositories/coach-output-repository";
import type { Dashboard, SessionAnalysis } from "./analytics";

export type CoachResult<T> =
  | { status: "ready"; output: T; model: string; createdAt: string }
  | { status: "missing" }
  | { status: "error"; kind: LlmFailureKind; message: string };

type Job<T> = {
  kind: "session" | "outlook";
  subject: string;
  promptVersion: string;
  payload: unknown;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
};

const inFlight = new Map<string, Promise<CoachResult<unknown>>>();

function hashOf(job: Job<unknown>): string {
  return createHash("sha256").update(job.promptVersion).update(JSON.stringify(job.payload)).digest("hex").slice(0, 32);
}

function cached<T>(job: Job<T>): CoachResult<T> {
  const latest = createCoachOutputRepository().latest(job.kind, job.subject);
  if (!latest || latest.inputHash !== hashOf(job as Job<unknown>)) return { status: "missing" };
  return { status: "ready", output: JSON.parse(latest.outputJson) as T, model: latest.model, createdAt: latest.createdAt };
}

async function generate<T>(job: Job<T>): Promise<CoachResult<T>> {
  const hit = cached(job);
  if (hit.status === "ready") return hit;
  const inputHash = hashOf(job as Job<unknown>);
  const key = `${job.kind}:${job.subject}:${inputHash}`;
  const running = inFlight.get(key);
  if (running) return running as Promise<CoachResult<T>>;

  const task = (async (): Promise<CoachResult<T>> => {
    const allowed = allowedNumbers(job.payload);
    let prompt = job.prompt;
    try {
      // Deux essais au plus : le second signale à Claude les chiffres non sourcés du premier.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const response = await getLlmClient().generateStructured({ system: job.system, prompt, schema: job.schema, jsonSchema: job.jsonSchema });
        const unsupported = findUnsupportedNumbers(collectText(response.data), allowed);
        if (unsupported.length === 0) {
          const row = createCoachOutputRepository().save({ kind: job.kind, subject: job.subject, inputHash, model: response.model, promptVersion: job.promptVersion, output: response.data });
          return { status: "ready", output: response.data, model: response.model, createdAt: row.createdAt };
        }
        prompt = `${job.prompt}\n\nATTENTION : ta réponse précédente contenait des chiffres absents des données (${unsupported.join(", ")}). Réécris-la en n'utilisant que des chiffres présents tels quels dans la charge utile.`;
      }
      throw new LlmError("invalid_output", "Chiffres non sourcés");
    } catch (error) {
      const kind: LlmFailureKind = error instanceof LlmError ? error.kind : "unavailable";
      return { status: "error", kind, message: LLM_FAILURE_MESSAGES[kind] };
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task as Promise<CoachResult<unknown>>);
  return task;
}

function sessionJob(analysis: SessionAnalysis): Job<SessionCoachOutput> {
  const payload = buildSessionPayload({
    session: analysis.activity,
    metrics: analysis.metrics,
    deltas: analysis.deltas,
    verdict: analysis.verdict,
    comparables: analysis.comparables,
    zones: analysis.profile.zones,
    lactateThresholdSpeedMps: analysis.profile.lactateThresholdSpeedMps,
  });
  return { kind: "session", subject: analysis.activity.id, promptVersion: SESSION_PROMPT_VERSION, payload, system: SESSION_SYSTEM_PROMPT, prompt: buildSessionPrompt(payload), schema: sessionCoachSchema, jsonSchema: sessionCoachJsonSchema as unknown as Record<string, unknown> };
}

function outlookJob(dashboard: Dashboard): Job<OutlookCoachOutput> {
  const payload = buildOutlookPayload({ suggestion: dashboard.suggestion, progression: dashboard.progression, recovery: dashboard.recovery, load: dashboard.load });
  return { kind: "outlook", subject: "current", promptVersion: OUTLOOK_PROMPT_VERSION, payload, system: OUTLOOK_SYSTEM_PROMPT, prompt: buildOutlookPrompt(payload), schema: outlookCoachSchema, jsonSchema: outlookCoachJsonSchema as unknown as Record<string, unknown> };
}

/** Lecture seule : jamais d'appel à Claude au chargement d'une page. */
export function readSessionCoach(analysis: SessionAnalysis): CoachResult<SessionCoachOutput> {
  return cached(sessionJob(analysis));
}

export function generateSessionCoach(analysis: SessionAnalysis): Promise<CoachResult<SessionCoachOutput>> {
  return generate(sessionJob(analysis));
}

export function readOutlookCoach(dashboard: Dashboard): CoachResult<OutlookCoachOutput> {
  return cached(outlookJob(dashboard));
}

export function generateOutlookCoach(dashboard: Dashboard): Promise<CoachResult<OutlookCoachOutput>> {
  return generate(outlookJob(dashboard));
}
