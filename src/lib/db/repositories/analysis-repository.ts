import { desc, eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { analyses } from "../schema";
import type { Analysis, NewAnalysis } from "../types";

export function createAnalysisRepository(database: AppDatabase = getDb()) {
  return {
    async create(input: NewAnalysis): Promise<Analysis> {
      const [created] = await database.insert(analyses).values(input).returning();
      return created;
    },

    async findLatestByActivityId(intervalsActivityId: string): Promise<Analysis | undefined> {
      return database.query.analyses.findFirst({
        where: eq(analyses.intervalsActivityId, intervalsActivityId),
        orderBy: desc(analyses.createdAt),
      });
    },

    async findById(id: string): Promise<Analysis | undefined> {
      return database.query.analyses.findFirst({
        where: eq(analyses.id, id),
      });
    },

    async listByActivityId(intervalsActivityId: string, limit = 10): Promise<Analysis[]> {
      return database.query.analyses.findMany({
        where: eq(analyses.intervalsActivityId, intervalsActivityId),
        orderBy: desc(analyses.createdAt),
        limit,
      });
    },
  };
}
