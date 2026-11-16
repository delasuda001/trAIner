import type { AppDatabase } from "../db/client";
import { createSyncedActivityRepository } from "../db/repositories/synced-activity-repository";

export type ActivityLabel = { date: string; name: string | null };
export type ActivityLookup = Record<string, ActivityLabel>;

/**
 * Identifiants d'activité distincts cités dans les preuves d'une ou plusieurs
 * réponses de conversation. `activityId` est nullable dans le schéma
 * (preuve agrégée, sans activité source) : ces entrées sont ignorées.
 */
export function extractEvidenceActivityIds(responses: Array<{ evidence: Array<{ activityId: string | null; [key: string]: unknown }> }>): string[] {
  const ids = new Set<string>();
  for (const response of responses) {
    for (const item of response.evidence) {
      if (item.activityId) ids.add(item.activityId);
    }
  }
  return Array.from(ids);
}

/**
 * Relit les preuves d'un message de conversation persisté (`content_json`).
 * `conversation_messages.content_json` n'est pas revalidé par Zod à la
 * lecture (contrairement à `analyses.llm_response_json`) : cette fonction
 * reste défensive et renvoie une liste vide plutôt que de lancer une
 * exception sur un message ancien ou malformé.
 */
export function parseStoredConversationEvidence(contentJson: string): Array<{ activityId: string | null }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return [];
  }
  const evidence = (parsed as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter((item): item is { activityId: unknown } => typeof item === "object" && item !== null && "activityId" in item)
    .map((item) => ({ activityId: typeof item.activityId === "string" ? item.activityId : null }));
}

/**
 * Résout un lot d'identifiants d'activité en date + nom lisibles, à partir
 * du cache local (`synced_activities`) uniquement — aucune requête externe.
 * Un identifiant introuvable localement (activité supprimée, par exemple)
 * est simplement absent du résultat ; l'appelant garde alors l'identifiant
 * brut en repli, jamais une valeur inventée.
 */
export async function buildActivityLookup(database: AppDatabase, activityIds: string[]): Promise<ActivityLookup> {
  const repository = createSyncedActivityRepository(database);
  const lookup: ActivityLookup = {};
  for (const activityId of activityIds) {
    const activity = await repository.findByExternalId(activityId);
    if (activity) lookup[activityId] = { date: activity.startDate, name: activity.name };
  }
  return lookup;
}
