import { randomUUID } from "node:crypto";
import { asc, desc, gte } from "drizzle-orm";
import type { LlmUsage } from "@/lib/coach/llm";
import { getDb, type AppDatabase } from "../client";
import { coachUsage } from "../schema";

export type UsageKind = "session" | "outlook" | "chat";
export type UsageOutcome = "ok" | "rejected" | "error";
export type UsageRow = typeof coachUsage.$inferSelect;

export function createUsageRepository(database: AppDatabase = getDb()) {
  return {
    record(input: { kind: UsageKind; subject: string | null; model: string; outcome: UsageOutcome; usage: LlmUsage }): void {
      database.insert(coachUsage).values({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        kind: input.kind,
        subject: input.subject,
        model: input.usage.models[0] ?? input.model,
        outcome: input.outcome,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cacheReadTokens: input.usage.cacheReadTokens,
        cacheCreationTokens: input.usage.cacheCreationTokens,
        costUsd: input.usage.costUsd,
        durationMs: input.usage.durationMs,
      }).run();
    },
    since(iso: string): UsageRow[] {
      return database.select().from(coachUsage).where(gte(coachUsage.createdAt, iso)).orderBy(desc(coachUsage.createdAt)).all();
    },
    first(): UsageRow | undefined {
      return database.select().from(coachUsage).orderBy(asc(coachUsage.createdAt)).limit(1).get();
    },
  };
}
