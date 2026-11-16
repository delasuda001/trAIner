import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { coachOutputs } from "../schema";
import type { CoachOutputRow } from "../types";

export function createCoachOutputRepository(database: AppDatabase = getDb()) {
  return {
    latest(kind: string, subject: string): CoachOutputRow | undefined {
      return database.select().from(coachOutputs).where(and(eq(coachOutputs.kind, kind), eq(coachOutputs.subject, subject))).orderBy(desc(coachOutputs.createdAt)).limit(1).get();
    },
    save(input: { kind: string; subject: string; inputHash: string; model: string; promptVersion: string; output: unknown }): CoachOutputRow {
      const row = { id: randomUUID(), kind: input.kind, subject: input.subject, inputHash: input.inputHash, model: input.model, promptVersion: input.promptVersion, outputJson: JSON.stringify(input.output), createdAt: new Date().toISOString() };
      database.insert(coachOutputs).values(row).run();
      return row;
    },
  };
}
