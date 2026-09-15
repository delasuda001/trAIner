import { eq, and, desc } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { activityStreamSummaries } from "../schema";
import type { ActivityStreamSummary, NewActivityStreamSummary } from "../types";

export function createStreamSummaryRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewActivityStreamSummary): Promise<ActivityStreamSummary> {
      const [created] = await database.insert(activityStreamSummaries).values(input).returning();
      return created;
    },

    /**
     * Upsert par `(intervals_activity_id, stream_version)` : un même couple
     * activité/version n'a qu'une ligne, rafraîchie si recalculée.
     */
    async upsert(input: NewActivityStreamSummary): Promise<ActivityStreamSummary> {
      const [row] = await database
        .insert(activityStreamSummaries)
        .values(input)
        .onConflictDoUpdate({
          target: [activityStreamSummaries.intervalsActivityId, activityStreamSummaries.streamVersion],
          set: { summaryJson: input.summaryJson, updatedAt: input.updatedAt },
        })
        .returning();
      return row;
    },

    async findByActivityAndVersion(intervalsActivityId: string, streamVersion: string): Promise<ActivityStreamSummary | undefined> {
      return database.query.activityStreamSummaries.findFirst({
        where: and(
          eq(activityStreamSummaries.intervalsActivityId, intervalsActivityId),
          eq(activityStreamSummaries.streamVersion, streamVersion)
        ),
      });
    },

    async findLatestByActivityId(intervalsActivityId: string): Promise<ActivityStreamSummary | undefined> {
      return database.query.activityStreamSummaries.findFirst({
        where: eq(activityStreamSummaries.intervalsActivityId, intervalsActivityId),
      });
    },

    async listByVersion(streamVersion: string): Promise<ActivityStreamSummary[]> {
      return database
        .select()
        .from(activityStreamSummaries)
        .where(eq(activityStreamSummaries.streamVersion, streamVersion))
        .orderBy(desc(activityStreamSummaries.updatedAt));
    },
  };
}
