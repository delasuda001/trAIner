import { integer, index, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const syncedActivities = sqliteTable("synced_activities", {
  id: text("id").primaryKey(),
  intervalsActivityId: text("intervals_activity_id").notNull(),
  startDate: text("start_date").notNull(),
  timezone: text("timezone"),
  name: text("name"),
  sportType: text("sport_type").notNull(),
  distanceM: real("distance_m"),
  movingTimeS: integer("moving_time_s"),
  elapsedTimeS: integer("elapsed_time_s"),
  elevationGainM: real("elevation_gain_m"),
  averageSpeedMps: real("average_speed_mps"),
  averageHeartRateBpm: real("average_heart_rate_bpm"),
  maxHeartRateBpm: real("max_heart_rate_bpm"),
  averageCadenceSpm: real("average_cadence_spm"),
  averagePowerW: real("average_power_w"),
  trainingLoad: real("training_load"),
  sourceUpdatedAt: text("source_updated_at"),
  syncedAt: text("synced_at").notNull(),
  ...timestamps,
}, (table) => ({
  intervalsActivityIdUnique: uniqueIndex("synced_activities_intervals_activity_id_unique").on(table.intervalsActivityId),
  startDateIndex: index("synced_activities_start_date_idx").on(table.startDate),
  sportTypeIndex: index("synced_activities_sport_type_idx").on(table.sportType),
}));

export const activityDetailsCache = sqliteTable("activity_details_cache", {
  id: text("id").primaryKey(),
  intervalsActivityId: text("intervals_activity_id").notNull(),
  detailJson: text("detail_json").notNull(),
  intervalsJson: text("intervals_json"),
  sourceUpdatedAt: text("source_updated_at"),
  fetchedAt: text("fetched_at").notNull(),
  ...timestamps,
}, (table) => ({ activityUnique: uniqueIndex("activity_details_cache_activity_unique").on(table.intervalsActivityId) }));

export const activityStreamSummaries = sqliteTable("activity_stream_summaries", {
  id: text("id").primaryKey(),
  intervalsActivityId: text("intervals_activity_id").notNull(),
  streamVersion: text("stream_version").notNull(),
  summaryJson: text("summary_json").notNull(),
  ...timestamps,
}, (table) => ({
  activityVersionUnique: uniqueIndex("activity_stream_summaries_activity_version_unique").on(table.intervalsActivityId, table.streamVersion),
  activityIndex: index("activity_stream_summaries_activity_idx").on(table.intervalsActivityId),
}));

export const manualSessions = sqliteTable("manual_sessions", {
  id: text("id").primaryKey(),
  sessionDate: text("session_date").notNull(),
  discipline: text("discipline").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  label: text("label"),
  note: text("note"),
  ...timestamps,
}, (table) => ({
  sessionDateIndex: index("manual_sessions_session_date_idx").on(table.sessionDate),
  disciplineIndex: index("manual_sessions_discipline_idx").on(table.discipline),
}));

export const userConfirmations = sqliteTable("user_confirmations", {
  id: text("id").primaryKey(),
  confirmationType: text("confirmation_type").notNull(),
  status: text("status").notNull(),
  sourceActivityId: text("source_activity_id"),
  sourceSegmentId: text("source_segment_id"),
  detectionConfidence: text("detection_confidence").notNull(),
  proposedPayloadJson: text("proposed_payload_json").notNull(),
  resolvedPayloadJson: text("resolved_payload_json"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  statusIndex: index("user_confirmations_status_idx").on(table.status),
  sourceActivityIndex: index("user_confirmations_source_activity_idx").on(table.sourceActivityId),
  typeStatusIndex: index("user_confirmations_type_status_idx").on(table.confirmationType, table.status),
}));

export const athleteContextVersions = sqliteTable("athlete_context_versions", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  contextJson: text("context_json").notNull(),
  sourceText: text("source_text"),
  createdAt: text("created_at").notNull(),
  activatedAt: text("activated_at"),
  archivedAt: text("archived_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({ statusIndex: index("athlete_context_versions_status_idx").on(table.status) }));

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  startDate: text("start_date"),
  targetDate: text("target_date"),
  targetValue: real("target_value"),
  targetUnit: text("target_unit"),
  description: text("description"),
  definitionJson: text("definition_json").notNull(),
  ...timestamps,
}, (table) => ({
  statusIndex: index("goals_status_idx").on(table.status),
  priorityIndex: index("goals_priority_idx").on(table.priority),
  targetDateIndex: index("goals_target_date_idx").on(table.targetDate),
}));

export const activityContexts = sqliteTable("activity_contexts", {
  id: text("id").primaryKey(),
  intervalsActivityId: text("intervals_activity_id").notNull(),
  sessionGoal: text("session_goal"),
  perceivedExertion: text("perceived_exertion"),
  unusualFatigue: integer("unusual_fatigue").default(0),
  painFlag: integer("pain_flag").default(0),
  note: text("note"),
  ...timestamps,
}, (table) => ({
  activityIndex: index("activity_contexts_activity_idx").on(table.intervalsActivityId),
}));

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  intervalsActivityId: text("intervals_activity_id").notNull(),
  deterministicMetricsJson: text("deterministic_metrics_json").notNull(),
  historicalComparisonJson: text("historical_comparison_json"),
  llmResponseJson: text("llm_response_json").notNull(),
  llmModel: text("llm_model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  ...timestamps,
}, (table) => ({
  activityIndex: index("analyses_activity_idx").on(table.intervalsActivityId),
}));

export const actionItems = sqliteTable("action_items", {
  id: text("id").primaryKey(),
  analysisId: text("analysis_id").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("open"),
  ...timestamps,
  completedAt: text("completed_at"),
}, (table) => ({
  analysisIndex: index("action_items_analysis_idx").on(table.analysisId),
}));

export const conversationThreads = sqliteTable("conversation_threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  goalId: text("goal_id"),
  ...timestamps,
}, (table) => ({ goalIndex: index("conversation_threads_goal_idx").on(table.goalId) }));

export const conversationMessages = sqliteTable("conversation_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  role: text("role").notNull(),
  contentJson: text("content_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({ threadIndex: index("conversation_messages_thread_idx").on(table.threadId, table.createdAt) }));

export const schema = { syncedActivities, activityDetailsCache, activityStreamSummaries, manualSessions, userConfirmations, athleteContextVersions, goals, activityContexts, analyses, actionItems, conversationThreads, conversationMessages };