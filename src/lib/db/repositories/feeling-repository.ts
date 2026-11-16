import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type AppDatabase } from "../client";
import { activityFeelings } from "../schema";

export const feelingInputSchema = z.object({
  perceivedEffort: z.number().int().min(1).max(10).nullable(),
  note: z.string().trim().max(600),
});

export type Feeling = z.infer<typeof feelingInputSchema> & { activityId: string; updatedAt: string };

export function createFeelingRepository(database: AppDatabase = getDb()) {
  return {
    get(activityId: string): Feeling | null {
      return database.select().from(activityFeelings).where(eq(activityFeelings.activityId, activityId)).get() ?? null;
    },
    findMany(activityIds: string[]): Feeling[] {
      return activityIds.length ? database.select().from(activityFeelings).where(inArray(activityFeelings.activityId, activityIds)).all() : [];
    },
    recent(limit: number): Feeling[] {
      return database.select().from(activityFeelings).orderBy(desc(activityFeelings.updatedAt)).limit(limit).all();
    },
    /** Une note vide et sans effort supprime le ressenti. */
    save(activityId: string, input: z.infer<typeof feelingInputSchema>): Feeling | null {
      if (!input.note && input.perceivedEffort == null) {
        database.delete(activityFeelings).where(eq(activityFeelings.activityId, activityId)).run();
        return null;
      }
      const row = { activityId, perceivedEffort: input.perceivedEffort, note: input.note, updatedAt: new Date().toISOString() };
      database.insert(activityFeelings).values(row).onConflictDoUpdate({ target: activityFeelings.activityId, set: row }).run();
      return row;
    },
  };
}
