import "server-only";

import { createHash } from "node:crypto";
import { createClaudeAgentClient } from "@/lib/coach/claude-agent-client";
import { currentCoachModel } from "@/lib/coach";
import { LlmError, type LlmClient, type LlmUsage } from "@/lib/coach/llm";
import { allowedNumbers, collectText, findUnsupportedNumbers, findZoneContradictions } from "@/lib/coach/number-guard";
import { buildSessionPayload, buildSessionPrompt, SESSION_PROMPT_VERSION, SESSION_SYSTEM_PROMPT, sessionCoachJsonSchema, sessionCoachSchema, type SessionCoachOutput } from "@/lib/coach/session-coach";
import { createUsageRepository } from "@/lib/db/repositories/usage-repository";
import { zoneOf } from "@/lib/engine/zones";
import { localDate } from "@/lib/dates";
import { recordUsage, readRateLimits } from "@/lib/server/usage";
import { budgetTokens, canSpend, TASK_ESTIMATE, type BudgetConfig } from "./budget";
import { gradeSessionOutput } from "./grade";
import { buildJudgePrompt, JUDGE_MODEL, JUDGE_PROMPT_VERSION, JUDGE_SYSTEM_PROMPT, judgeJsonSchema, judgeSchema, resolveJudgement, type JudgeCase } from "./judge";
import { judgeAverage, recommend, renderReport, type SideStats, type VariantReport } from "./report";
import { loadFixtures, loadVariants, logNightly, readJudgement, readOutput, writeJudgement, writeOutput, writeReport, type StoredOutput } from "./store";
import type { BenchFixture, BenchVariant } from "./types";
import { applyDropKeys, variantKey } from "./variant";

/**
 * File de travail du banc, reprise d'une nuit à l'autre : d'abord les sorties
 * de la version en place, puis celles de chaque variante, puis un jugement par
 * variante complète. Chaque tâche vérifie le budget avant de partir ; les
 * sorties déjà obtenues (même prompt, même charge utile) ne sont jamais refaites.
 */

export const BASELINE: BenchVariant = { name: "en-place", description: `Version en place (${SESSION_PROMPT_VERSION}).`, dropKeys: [], source: "en place" };

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function payloadFor(fixture: BenchFixture, variant: BenchVariant) {
  return applyDropKeys(buildSessionPayload(fixture.input), variant.dropKeys);
}

function outputKey(fixture: BenchFixture, variant: BenchVariant, model: string): string {
  return hash({ variant: variantKey(variant, SESSION_SYSTEM_PROMPT), payload: payloadFor(fixture, variant), model });
}

export type BenchTask =
  | { type: "generate"; variant: BenchVariant; fixture: BenchFixture; key: string }
  | { type: "judge"; variant: BenchVariant; key: string };

/** Ce qu'il reste à faire, dans l'ordre. */
export function pendingTasks(model = currentCoachModel()): BenchTask[] {
  const fixtures = loadFixtures();
  if (!fixtures.length) return [];
  const variants = loadVariants();
  const tasks: BenchTask[] = [];
  const missing = (variant: BenchVariant) => fixtures.flatMap((fixture) => {
    const key = outputKey(fixture, variant, model);
    return readOutput(variant.name, fixture.id)?.key === key ? [] : [{ type: "generate" as const, variant, fixture, key }];
  });
  const baselineMissing = missing(BASELINE);
  tasks.push(...baselineMissing);
  for (const variant of variants) {
    const generation = missing(variant);
    tasks.push(...generation);
    if (!generation.length && !baselineMissing.length) {
      const key = hash({ judge: JUDGE_PROMPT_VERSION, outputs: fixtures.map((fixture) => [readOutput(BASELINE.name, fixture.id)?.key, readOutput(variant.name, fixture.id)?.key]) });
      if (readJudgement(variant.name)?.key !== key) tasks.push({ type: "judge", variant, key });
    }
  }
  return tasks;
}

function usageOf(usage: LlmUsage | null): StoredOutput["usage"] {
  return usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens, cacheCreationTokens: usage.cacheCreationTokens } : null;
}

async function runGeneration(task: Extract<BenchTask, { type: "generate" }>, client: LlmClient): Promise<void> {
  const { fixture, variant } = task;
  const payload = payloadFor(fixture, variant);
  const system = variant.systemPrompt ?? SESSION_SYSTEM_PROMPT;
  const zones = fixture.input.zones;
  try {
    // Un seul essai : on mesure la réponse brute, sans la seconde chance de l'application.
    const response = await client.generateStructured({ system, prompt: buildSessionPrompt(payload), schema: sessionCoachSchema, jsonSchema: sessionCoachJsonSchema as unknown as Record<string, unknown> });
    const text = collectText(response.data);
    const issues = [...findUnsupportedNumbers(text, allowedNumbers(payload)), ...findZoneContradictions(text, (hr) => zoneOf(hr, zones))];
    recordUsage("bench", `${variant.name}/${fixture.id}`, response.model, issues.length ? "rejected" : "ok", response.usage);
    const grade = gradeSessionOutput({ output: response.data, payload, zoneOf: (hr) => zoneOf(hr, zones), prescription: fixture.input.prescription });
    writeOutput(variant.name, fixture.id, { key: task.key, createdAt: new Date().toISOString(), output: response.data, error: null, guardIssues: issues, deterministic: grade.score, usage: usageOf(response.usage) });
  } catch (error) {
    if (error instanceof LlmError && error.usage) recordUsage("bench", `${variant.name}/${fixture.id}`, client.name, error.kind === "invalid_output" ? "rejected" : "error", error.usage);
    if (error instanceof LlmError && (error.kind === "rate_limited" || error.kind === "auth" || error.kind === "unavailable")) throw error;
    writeOutput(variant.name, fixture.id, { key: task.key, createdAt: new Date().toISOString(), output: null, error: error instanceof Error ? error.message.slice(0, 300) : String(error), guardIssues: [], deterministic: 0, usage: error instanceof LlmError ? usageOf(error.usage) : null });
  }
}

/** Faits de référence montrés au juge : le verdict et les consignes du moteur, pas la charge utile entière. */
function factsFor(fixture: BenchFixture) {
  const payload = buildSessionPayload(fixture.input);
  return { verdict_calcule: payload.verdict_calcule, ecart: payload.comparaison.ecart_face_aux_comparables, comparaison_fragile: payload.comparaison.comparaison_fragile, consignes_moteur: payload.consignes_moteur, hausse_de_charge: payload.contexte_de_la_seance?.hausse_de_charge ?? "—", ressenti: payload.ressenti };
}

function sideStats(variant: BenchVariant, fixtures: BenchFixture[], judge: number | null): SideStats {
  const outputs = fixtures.map((fixture) => readOutput(variant.name, fixture.id));
  const used = outputs.filter((output): output is StoredOutput => output != null);
  const mean = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);
  return {
    // Notation refaite au moment du rapport : une grille corrigée s'applique aussi aux sorties déjà obtenues.
    deterministic: mean(fixtures.flatMap((fixture) => {
      const stored = readOutput(variant.name, fixture.id);
      const parsed = sessionCoachSchema.safeParse(stored?.output);
      if (!stored) return [];
      if (!parsed.success) return [0];
      return [gradeSessionOutput({ output: parsed.data, payload: payloadFor(fixture, variant), zoneOf: (hr) => zoneOf(hr, fixture.input.zones), prescription: fixture.input.prescription }).score];
    })),
    judge,
    inputTokens: mean(used.map((output) => (output.usage ? output.usage.inputTokens + output.usage.cacheCreationTokens + output.usage.cacheReadTokens : 0))),
    outputTokens: mean(used.map((output) => output.usage?.outputTokens ?? 0)),
    guardFailures: used.filter((output) => output.guardIssues.length > 0 || output.output == null).length,
    count: used.length,
  };
}

async function runJudge(task: Extract<BenchTask, { type: "judge" }>): Promise<VariantReport | null> {
  const fixtures = loadFixtures();
  const cases: JudgeCase[] = [];
  for (const fixture of fixtures) {
    const baseline = sessionCoachSchema.safeParse(readOutput(BASELINE.name, fixture.id)?.output);
    const variant = sessionCoachSchema.safeParse(readOutput(task.variant.name, fixture.id)?.output);
    if (baseline.success && variant.success) cases.push({ fixtureId: fixture.id, label: fixture.label, facts: factsFor(fixture), baseline: baseline.data as SessionCoachOutput, variant: variant.data as SessionCoachOutput });
  }
  if (!cases.length) return null;
  const client = createClaudeAgentClient(JUDGE_MODEL);
  const response = await client.generateStructured({ system: JUDGE_SYSTEM_PROMPT, prompt: buildJudgePrompt(cases, task.variant.name), schema: judgeSchema, jsonSchema: judgeJsonSchema as unknown as Record<string, unknown> });
  recordUsage("bench", `juge/${task.variant.name}`, response.model, "ok", response.usage);
  writeJudgement(task.variant.name, { key: task.key, createdAt: new Date().toISOString(), output: response.data, usage: usageOf(response.usage) });

  const verdicts = resolveJudgement(response.data, task.variant.name);
  const baselineJudge = Math.round((verdicts.reduce((sum, verdict) => sum + judgeAverage(verdict.baseline), 0) / verdicts.length) * 100) / 100;
  const variantJudge = Math.round((verdicts.reduce((sum, verdict) => sum + judgeAverage(verdict.variant), 0) / verdicts.length) * 100) / 100;
  const baseline = sideStats(BASELINE, fixtures, baselineJudge);
  const candidate = sideStats(task.variant, fixtures, variantJudge);
  const decision = recommend(baseline, candidate);
  const date = localDate();
  const report: VariantReport = {
    variant: task.variant.name,
    description: task.variant.description,
    date,
    baseline,
    candidate,
    byCriterion: (["exactitude", "comparaison", "actionnable", "ton", "concision"] as const).map((criterion) => ({
      criterion,
      baseline: Math.round((verdicts.reduce((sum, verdict) => sum + verdict.baseline[criterion], 0) / verdicts.length) * 10) / 10,
      variant: Math.round((verdicts.reduce((sum, verdict) => sum + verdict.variant[criterion], 0) / verdicts.length) * 10) / 10,
    })),
    preferences: { baseline: verdicts.filter((verdict) => verdict.preferred === "en place").length, variant: verdicts.filter((verdict) => verdict.preferred === "variante").length, equal: verdicts.filter((verdict) => verdict.preferred === "égal").length },
    ...decision,
    verdicts,
    overall: response.data.overall,
  };
  writeReport({ date, variant: task.variant.name, recommendation: report.recommendation, why: report.why, file: `${date}-${task.variant.name}.md` }, renderReport(report), report);
  return report;
}

export type RunSummary = { done: string[]; stoppedBecause: string | null; remaining: number; tokensUsed: number };

/** Tokens comptés dans les plafonds pour le travail automatique (banc + bilan) depuis `sinceIso`. */
export function automaticTokensSince(sinceIso: string): number {
  return createUsageRepository().since(sinceIso).filter((row) => row.kind === "bench" || row.kind === "weekly").reduce((sum, row) => sum + budgetTokens(row), 0);
}

export async function runBench(config: BudgetConfig, options: { nightStartIso: string; dryRun?: boolean } ): Promise<RunSummary> {
  const done: string[] = [];
  const weekStartIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const client = createClaudeAgentClient(currentCoachModel());
  let tasks = pendingTasks();
  while (tasks.length) {
    const task = tasks[0];
    const estimate = task.type === "judge" ? TASK_ESTIMATE.judge : TASK_ESTIMATE.generation;
    const nightUsed = automaticTokensSince(options.nightStartIso);
    const decision = canSpend({ estimate, nightUsed, weekUsed: automaticTokensSince(weekStartIso), config, windows: Object.values(readRateLimits()).map((window) => ({ window: window.window ?? "inconnue", utilization: window.utilization, resetsAt: window.resetsAt, status: window.status })), now: new Date() });
    if (!decision.ok) return { done, stoppedBecause: decision.reason, remaining: tasks.length, tokensUsed: nightUsed };
    const label = task.type === "judge" ? `jugement ${task.variant.name}` : `${task.variant.name} / ${task.fixture.id}`;
    if (options.dryRun) return { done: [`(essai à blanc) prochaine tâche : ${label}`], stoppedBecause: null, remaining: tasks.length, tokensUsed: nightUsed };
    try {
      if (task.type === "generate") await runGeneration(task, client);
      else {
        const report = await runJudge(task);
        if (report) logNightly(`rapport ${report.variant} : ${report.recommendation} (${report.why})`);
      }
      done.push(label);
      logNightly(`banc : ${label} fait`);
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : String(error);
      logNightly(`banc : arrêt sur ${label} (${reason})`);
      return { done, stoppedBecause: reason, remaining: tasks.length, tokensUsed: automaticTokensSince(options.nightStartIso) };
    }
    tasks = pendingTasks();
  }
  return { done, stoppedBecause: null, remaining: 0, tokensUsed: automaticTokensSince(options.nightStartIso) };
}
