import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/client";
import { activityStreamSummaries, analyses, syncedActivities } from "../db/schema";

export type PerformanceProfile = {
  summary: string;
  recentHighlights: string[];
  volumeTrend: string | null;
  thresholdEstimate: string | null;
  keyTakeaways: string[];
};

export async function buildPerformanceProfile(database: AppDatabase, activityId: string): Promise<PerformanceProfile | null> {
  const activity = await database.query.syncedActivities.findFirst({ where: eq(syncedActivities.intervalsActivityId, activityId) });
  if (!activity) return null;

  const recentSummaries = await database.select().from(activityStreamSummaries).where(eq(activityStreamSummaries.intervalsActivityId, activityId)).limit(10);
  const recentAnalyses = await database.select().from(analyses).where(eq(analyses.intervalsActivityId, activityId)).orderBy(sql`${analyses.createdAt} DESC`).limit(3);

  const highlights = recentSummaries.length > 0
    ? recentSummaries.map((entry) => {
        const parsed = JSON.parse(entry.summaryJson) as Record<string, unknown>;
        const best = parsed.bestEfforts as Record<string, unknown> | undefined;
        return best ? `Meilleur effort: ${Object.keys(best).length} série(s) répertoriée(s).` : "Résumé de courbes disponible.";
      })
    : ["Pas de résumé de courbes encore calculé pour cette activité."];

  const keyTakeaways = recentAnalyses.length > 0
    ? recentAnalyses.flatMap((analysis) => {
        const llm = JSON.parse(analysis.llmResponseJson) as { key_takeaways?: string[] };
        return llm.key_takeaways ?? [];
      }).slice(0, 3)
    : ["Aucun débrief récent exploitable pour synthèse."];

  return {
    summary: `Profil de performance construit à partir des dernières données de ${activity.name ?? "l’activité"}.`,
    recentHighlights: highlights,
    volumeTrend: activity.averageSpeedMps != null ? `Allure moyenne ${activity.averageSpeedMps.toFixed(2)} m/s.` : null,
    thresholdEstimate: activity.maxHeartRateBpm != null ? `FC max observée ${Math.round(activity.maxHeartRateBpm)} bpm.` : null,
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : ["Suivi de la performance en cours."],
  };
}
