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

export const schema = { syncedActivities, activityDetailsCache, activityStreamSummaries, manualSessions, userConfirmations, athleteContextVersions, goals };