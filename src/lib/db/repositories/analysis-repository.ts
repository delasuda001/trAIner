import { desc, eq } from "drizzle-orm";
import { getDb, type AppDatabase } from "../client";
import { analyses } from "../schema";
import type { Analysis, NewAnalysis } from "../types";
import { activityAnalysisResponseSchema, type ActivityAnalysisResponse } from "@/lib/llm/schemas";

/**
 * Résultat de la lecture d'un `llm_response_json` persisté.
 *
 * docs/15-local-data-model.md impose une validation Zod aux frontières JSON, à
 * l'écriture ET à la lecture. Une analyse écrite avant l'ajout d'un champ au
 * contrat (ex. `key_takeaways`, cf. prompt_version) ne satisfait plus le schéma
 * courant : elle est signalée `outdated` plutôt que rendue telle quelle, ce qui
 * ferait planter l'interface. L'utilisateur est alors invité à la régénérer.
 */
export type ParsedStoredAnalysis =
  | { status: "ok"; analysis: ActivityAnalysisResponse }
  | { status: "outdated"; issues: string[] };

export function parseStoredAnalysis(row: Pick<Analysis, "llmResponseJson">): ParsedStoredAnalysis {
  let raw: unknown;
  try {
    raw = JSON.parse(row.llmResponseJson);
  } catch (error) {
    return { status: "outdated", issues: [`JSON illisible : ${error instanceof Error ? error.message : "inconnu"}`] };
  }

  const parsed = activityAnalysisResponseSchema.safeParse(raw);
  if (parsed.success) {
    return { status: "ok", analysis: parsed.data };
  }

  return {
    status: "outdated",
    issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`),
  };
}

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
