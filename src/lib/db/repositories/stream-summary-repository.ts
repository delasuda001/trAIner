import { eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { activityStreamSummaries } from "../schema";
import type { ActivityStreamSummary, NewActivityStreamSummary } from "../types";

export function createStreamSummaryRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewActivityStreamSummary): Promise<ActivityStreamSummary> {
      const [created] = await database.insert(activityStreamSummaries).values(input).returning();
      return created;
    },
    async findLatestByActivityId(intervalsActivityId: string): Promise<ActivityStreamSummary | undefined> {
      return database.query.activityStreamSummaries.findFirst({
        where: eq(activityStreamSummaries.intervalsActivityId, intervalsActivityId),
      });
    },
  };
}
