import { eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { activityContexts } from "../schema";
import type { ActivityContext, NewActivityContext } from "../types";

export function createActivityContextRepository(database: AppDatabase = getDb()) {
  return {
    async upsert(input: NewActivityContext): Promise<ActivityContext> {
      const existing = await database.query.activityContexts.findFirst({
        where: eq(activityContexts.intervalsActivityId, input.intervalsActivityId),
      });

      if (existing) {
        // Mise à jour : ne réassigne jamais `id` ni `createdAt` (identité et
        // date de création de la ligne restent celles de `existing`) ; seuls
        // les champs métier et `updatedAt` sont écrits.
        const [updated] = await database
          .update(activityContexts)
          .set({
            sessionGoal: input.sessionGoal,
            perceivedExertion: input.perceivedExertion,
            unusualFatigue: input.unusualFatigue,
            painFlag: input.painFlag,
            note: input.note,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(activityContexts.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await database.insert(activityContexts).values(input).returning();
      return created;
    },

    async findByActivityId(intervalsActivityId: string): Promise<ActivityContext | undefined> {
      return database.query.activityContexts.findFirst({
        where: eq(activityContexts.intervalsActivityId, intervalsActivityId),
      });
    },

    async findById(id: string): Promise<ActivityContext | undefined> {
      return database.query.activityContexts.findFirst({
        where: eq(activityContexts.id, id),
      });
    },

    async delete(id: string): Promise<boolean> {
      const result = await database.delete(activityContexts).where(eq(activityContexts.id, id));
      return result.changes > 0;
    },
  };
}
