import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { coachOutputs } from "../schema";
import type { CoachOutputRow } from "../types";

export function createCoachOutputRepository(database: AppDatabase = getDb()) {
  return {
    latest(kind: string, subject: string): CoachOutputRow | undefined {
      return database.select().from(coachOutputs).where(and(eq(coachOutputs.kind, kind), eq(coachOutputs.subject, subject))).orderBy(desc(coachOutputs.createdAt)).limit(1).get();
    },
    /** Sorties d'un type créées dans [from, to[ (ISO), plus récentes d'abord. */
    createdBetween(kind: string, from: string, to: string): CoachOutputRow[] {
      return database.select().from(coachOutputs).where(and(eq(coachOutputs.kind, kind), gte(coachOutputs.createdAt, from), lt(coachOutputs.createdAt, to))).orderBy(desc(coachOutputs.createdAt)).all();
    },
    /** Dernières sorties d'un type, tous sujets confondus. */
    recent(kind: string, limit: number): CoachOutputRow[] {
      return database.select().from(coachOutputs).where(eq(coachOutputs.kind, kind)).orderBy(desc(coachOutputs.createdAt)).limit(limit).all();
    },
    /** Réétiquette une sortie (reprise des analyses de Bastien par son profil de test). */
    setInputHash(id: string, inputHash: string): void {
      database.update(coachOutputs).set({ inputHash }).where(eq(coachOutputs.id, id)).run();
    },
    save(input: { kind: string; subject: string; inputHash: string; model: string; promptVersion: string; output: unknown }): CoachOutputRow {
      const row = { id: randomUUID(), kind: input.kind, subject: input.subject, inputHash: input.inputHash, model: input.model, promptVersion: input.promptVersion, outputJson: JSON.stringify(input.output), createdAt: new Date().toISOString() };
      database.insert(coachOutputs).values(row).run();
      return row;
    },
  };
}
