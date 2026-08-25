import { eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { activityDetailsCache } from "../schema";
import type { ActivityDetailsCache } from "../types";

export function createActivityDetailCacheRepository(database: AppDatabase = getDb()) {
  return {
    async findByActivityId(intervalsActivityId: string): Promise<ActivityDetailsCache | undefined> { return database.query.activityDetailsCache.findFirst({ where: eq(activityDetailsCache.intervalsActivityId, intervalsActivityId) }); },
    async upsert(input: ActivityDetailsCache): Promise<ActivityDetailsCache> { const [row] = await database.insert(activityDetailsCache).values(input).onConflictDoUpdate({ target: activityDetailsCache.intervalsActivityId, set: { detailJson: input.detailJson, intervalsJson: input.intervalsJson, sourceUpdatedAt: input.sourceUpdatedAt, fetchedAt: input.fetchedAt, updatedAt: input.updatedAt } }).returning(); return row; },
  };
}