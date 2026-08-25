import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { syncedActivities } from "../schema";
import type { NewSyncedActivity, SyncedActivity } from "../types";

export function createSyncedActivityRepository(database: AppDatabase = getDb()) {
  return {
    async upsert(input: NewSyncedActivity): Promise<SyncedActivity> {
      const [row] = await database.insert(syncedActivities).values(input).onConflictDoUpdate({ target: syncedActivities.intervalsActivityId, set: { ...input, updatedAt: input.updatedAt } }).returning();
      return row;
    },
    async findById(id: string): Promise<SyncedActivity | undefined> { return database.query.syncedActivities.findFirst({ where: eq(syncedActivities.id, id) }); },
    async findByPeriod(from: string, to: string): Promise<SyncedActivity[]> { return database.select().from(syncedActivities).where(and(gte(syncedActivities.startDate, from), lte(syncedActivities.startDate, to))).orderBy(syncedActivities.startDate); },
    async update(id: string, changes: Partial<NewSyncedActivity>): Promise<SyncedActivity | undefined> { const [row] = await database.update(syncedActivities).set(changes).where(eq(syncedActivities.id, id)).returning(); return row; },
  };
}