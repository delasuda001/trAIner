import type { AppDatabase } from "../db/client";
import { createGoalRepository } from "../db/repositories/goal-repository";
import { createSyncedActivityRepository } from "../db/repositories/synced-activity-repository";
import { conversationScopeSchema, type ConversationResponse, type PerformanceProfile } from "./schemas";
import type { ConversationMessage } from "../db/types";

export type ConversationScope = {
  kind: "activity" | "trend" | "goal" | "data_gap";
  periodStart: string | null;
  periodEnd: string | null;
  activityIds: string[];
  goalId: string | null;
};

export type ConversationContext = {
  question: string;
  scope: ConversationScope;
  selectedActivities: Array<{
    activityId: string;
    date: string;
    name: string | null;
    sportType: string;
    distanceM: number | null;
    movingTimeS: number | null;
    averageSpeedMps: number | null;
    averageHeartRateBpm: number | null;
    averageCadenceSpm: number | null;
    elevationGainM: number | null;
  }>;
  selectedGoal: { id: string; title: string; type: string; targetValue: number | null; targetUnit: string | null } | null;
  previousMessages: Array<{ role: string; content: string }>;
  /** Profil de performance calculé, en complément du contexte déclaré (jamais en remplacement). */
  performanceProfile: PerformanceProfile | null;
  missingData: string[];
};

export async function classifyQuestionAndSelectScope(question: string, database: AppDatabase): Promise<ConversationScope> {
  const normalized = question.toLocaleLowerCase("fr-FR");
  const activityMatch = question.match(/\b(i\d{6,}|activity[-_][\w-]+)\b/i);
  const today = new Date();
  const end = today.toISOString();
  const days = normalized.includes("mois") ? 90 : normalized.includes("semaine") || normalized.includes("7 jours") ? 7 : 30;
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  if (activityMatch) {
    return conversationScopeSchema.parse({ kind: "activity", periodStart: null, periodEnd: null, activityIds: [activityMatch[1]], goalId: null });
  }

  if (normalized.includes("objectif") || normalized.includes("course") && normalized.includes("cohérent")) {
    const goals = await createGoalRepository(database).findByStatus("active");
    return conversationScopeSchema.parse({ kind: "goal", periodStart: start, periodEnd: end, activityIds: [], goalId: goals[0]?.id ?? null });
  }

  if (/(évolution|evolution|tendance|compare|dernières|dernieres|sorties faciles|période|periode)/.test(normalized)) {
    return conversationScopeSchema.parse({ kind: "trend", periodStart: start, periodEnd: end, activityIds: [], goalId: null });
  }

  return conversationScopeSchema.parse({ kind: "data_gap", periodStart: start, periodEnd: end, activityIds: [], goalId: null });
}

export async function buildConversationContext(
  question: string,
  database: AppDatabase,
  previousMessages: ConversationMessage[] = [],
  options: { performanceProfile?: PerformanceProfile | null } = {}
): Promise<ConversationContext> {
  const scope = await classifyQuestionAndSelectScope(question, database);
  const activityRepository = createSyncedActivityRepository(database);
  const activities = scope.activityIds.length > 0
    ? (await Promise.all(scope.activityIds.map((id) => activityRepository.findByExternalId(id)))).filter((activity): activity is NonNullable<typeof activity> => activity !== undefined)
    : scope.periodStart && scope.periodEnd
      ? await activityRepository.findByPeriod(scope.periodStart, scope.periodEnd, 30)
      : [];
  const goals = scope.goalId ? await createGoalRepository(database).findByStatus("active") : [];
  const selectedGoal = goals.find((goal) => goal.id === scope.goalId) ?? null;
  const missingData: string[] = [];
  if (activities.length === 0) missingData.push("Aucune activité de course ne correspond au périmètre sélectionné.");
  if (scope.kind === "goal" && !selectedGoal) missingData.push("Aucun objectif actif n’est disponible.");

  return {
    question,
    scope,
    selectedActivities: activities.map((activity) => ({
      activityId: activity.intervalsActivityId,
      date: activity.startDate,
      name: activity.name,
      sportType: activity.sportType,
      distanceM: activity.distanceM,
      movingTimeS: activity.movingTimeS,
      averageSpeedMps: activity.averageSpeedMps,
      averageHeartRateBpm: activity.averageHeartRateBpm,
      averageCadenceSpm: activity.averageCadenceSpm,
      elevationGainM: activity.elevationGainM,
    })),
    selectedGoal: selectedGoal ? { id: selectedGoal.id, title: selectedGoal.title, type: selectedGoal.type, targetValue: selectedGoal.targetValue, targetUnit: selectedGoal.targetUnit } : null,
    previousMessages: previousMessages.slice(-6).map((message) => ({ role: message.role, content: message.contentJson })),
    performanceProfile: options.performanceProfile ?? null,
    missingData,
  };
}

export function buildConversationPrompt(context: ConversationContext): string {
  return `Answer the user's data-grounded running question using only this structured context. Never invent metrics. Distinguish facts, comparisons, hypotheses, limitations, and missing data. Do not diagnose injury, illness, overtraining, or medical conditions. Cite activity IDs in evidence when available.\n\n${JSON.stringify(context, null, 2)}`;
}

export function hasSufficientConversationData(context: ConversationContext): boolean {
  return context.selectedActivities.length > 0 || context.selectedGoal !== null || context.missingData.length > 0;
}

export type ConversationResponseContract = ConversationResponse;
