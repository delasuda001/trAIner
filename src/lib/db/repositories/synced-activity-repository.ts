import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { syncedActivities } from "../schema";
import type { NewSyncedActivity, SyncedActivity } from "../types";

export type SyncedActivityUpsertOutcome = { activity: SyncedActivity; operation: "created" | "updated" | "unchanged" };

export function createSyncedActivityRepository(database: AppDatabase = getDb()) {
  return {
    async upsert(input: NewSyncedActivity): Promise<SyncedActivity> {
      const changes: Partial<NewSyncedActivity> = { ...input };
      delete changes.id;
      delete changes.createdAt;
      const [row] = await database.insert(syncedActivities).values(input).onConflictDoUpdate({ target: syncedActivities.intervalsActivityId, set: { ...changes, updatedAt: input.updatedAt } }).returning();
      return row;
    },
    async upsertWithOutcome(input: NewSyncedActivity): Promise<SyncedActivityUpsertOutcome> {
      const existing = await database.query.syncedActivities.findFirst({ where: eq(syncedActivities.intervalsActivityId, input.intervalsActivityId) });
      if (existing && sameMappedFields(existing, input)) {
        const activity = await this.upsert(input);
        return { activity, operation: "unchanged" };
      }
      const activity = await this.upsert(input);
      return { activity, operation: existing ? "updated" : "created" };
    },
    async findByExternalId(intervalsActivityId: string): Promise<SyncedActivity | undefined> { return database.query.syncedActivities.findFirst({ where: eq(syncedActivities.intervalsActivityId, intervalsActivityId) }); },
    async findById(id: string): Promise<SyncedActivity | undefined> { return database.query.syncedActivities.findFirst({ where: eq(syncedActivities.id, id) }); },
    async findByPeriod(from: string, to: string, limit?: number): Promise<SyncedActivity[]> { const query = database.select().from(syncedActivities).where(and(gte(syncedActivities.startDate, from), lte(syncedActivities.startDate, to))).orderBy(desc(syncedActivities.startDate)); return limit === undefined ? query : query.limit(limit); },
    async update(id: string, changes: Partial<NewSyncedActivity>): Promise<SyncedActivity | undefined> { const [row] = await database.update(syncedActivities).set(changes).where(eq(syncedActivities.id, id)).returning(); return row; },
  };
}

function sameMappedFields(existing: SyncedActivity, input: NewSyncedActivity): boolean {
  const fields = ["intervalsActivityId", "startDate", "timezone", "name", "sportType", "distanceM", "movingTimeS", "elapsedTimeS", "elevationGainM", "averageSpeedMps", "averageHeartRateBpm", "maxHeartRateBpm", "averageCadenceSpm", "averagePowerW", "trainingLoad", "sourceUpdatedAt"] as const;
  return fields.every((field) => existing[field] === input[field]);
}