import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { benchVariantSchema, type BenchFixture, type BenchVariant } from "./types";

/**
 * Fichiers du banc. Données personnelles (synthèses de séances, sorties) :
 * `data/bench/`, ignoré par git. Variantes (prompts, sans donnée) : `bench/variants/`, versionné.
 */

export const BENCH_DATA_DIR = resolve(process.cwd(), "data/bench");
export const VARIANTS_DIR = resolve(process.cwd(), "bench/variants");

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
}

function readJson(path: string): unknown {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as unknown) : null;
}

export function saveFixtures(fixtures: BenchFixture[]): void {
  writeJson(join(BENCH_DATA_DIR, "fixtures.json"), fixtures);
}

export function loadFixtures(): BenchFixture[] {
  return (readJson(join(BENCH_DATA_DIR, "fixtures.json")) as BenchFixture[] | null) ?? [];
}

export function loadVariants(): BenchVariant[] {
  if (!existsSync(VARIANTS_DIR)) return [];
  return readdirSync(VARIANTS_DIR).filter((file) => file.endsWith(".json")).sort().map((file) => benchVariantSchema.parse(JSON.parse(readFileSync(join(VARIANTS_DIR, file), "utf8"))));
}

const usageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number(), cacheCreationTokens: z.number() });

export const storedOutputSchema = z.object({
  key: z.string(),
  createdAt: z.string(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
  guardIssues: z.array(z.string()),
  deterministic: z.number().nullable(),
  usage: usageSchema.nullable(),
});

export type StoredOutput = z.infer<typeof storedOutputSchema>;

export function outputPath(variant: string, fixtureId: string): string {
  return join(BENCH_DATA_DIR, "outputs", variant, `${fixtureId.replace(/[^a-z0-9-]/gi, "_")}.json`);
}

export function readOutput(variant: string, fixtureId: string): StoredOutput | null {
  const parsed = storedOutputSchema.safeParse(readJson(outputPath(variant, fixtureId)));
  return parsed.success ? parsed.data : null;
}

export function writeOutput(variant: string, fixtureId: string, value: StoredOutput): void {
  writeJson(outputPath(variant, fixtureId), value);
}

export const storedJudgementSchema = z.object({ key: z.string(), createdAt: z.string(), output: z.unknown(), usage: usageSchema.nullable() });
export type StoredJudgement = z.infer<typeof storedJudgementSchema>;

export function readJudgement(variant: string): StoredJudgement | null {
  const parsed = storedJudgementSchema.safeParse(readJson(join(BENCH_DATA_DIR, "judgements", `${variant}.json`)));
  return parsed.success ? parsed.data : null;
}

export function writeJudgement(variant: string, value: StoredJudgement): void {
  writeJson(join(BENCH_DATA_DIR, "judgements", `${variant}.json`), value);
}

export const reportIndexSchema = z.array(z.object({ date: z.string(), variant: z.string(), recommendation: z.string(), why: z.string(), file: z.string() }));
export type ReportIndex = z.infer<typeof reportIndexSchema>;

export function readReportIndex(): ReportIndex {
  const parsed = reportIndexSchema.safeParse(readJson(join(BENCH_DATA_DIR, "reports", "index.json")));
  return parsed.success ? parsed.data : [];
}

export function writeReport(entry: ReportIndex[number], markdown: string, details: unknown): void {
  mkdirSync(join(BENCH_DATA_DIR, "reports"), { recursive: true });
  writeFileSync(join(BENCH_DATA_DIR, "reports", entry.file), markdown);
  writeJson(join(BENCH_DATA_DIR, "reports", entry.file.replace(/\.md$/, ".json")), details);
  const index = readReportIndex().filter((existing) => existing.file !== entry.file);
  writeJson(join(BENCH_DATA_DIR, "reports", "index.json"), [entry, ...index].slice(0, 100));
}

export function readReportMarkdown(file: string): string | null {
  if (!/^[\w.-]+\.md$/.test(file)) return null;
  const path = join(BENCH_DATA_DIR, "reports", file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Journal du travail de nuit (une ligne par événement). */
export function logNightly(line: string): void {
  mkdirSync(BENCH_DATA_DIR, { recursive: true });
  const path = join(BENCH_DATA_DIR, "nightly.log");
  const previous = existsSync(path) ? readFileSync(path, "utf8").split("\n").slice(-2000).join("\n") : "";
  writeFileSync(path, `${previous}${previous && !previous.endsWith("\n") ? "\n" : ""}${new Date().toISOString()} ${line}\n`);
}
