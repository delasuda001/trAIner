import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Schéma local (SQLite). Les tables de l'ancienne intégration intervals.icu
 * et de l'assistant Gemini (synced_activities, analyses, conversation_*…)
 * restent physiquement dans le fichier de base mais ne sont plus utilisées.
 */

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const activities = sqliteTable("activities", {
  /** `${source}:${sourceId}` */
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  sourceType: text("source_type").notNull(),
  startTimeUtc: text("start_time_utc").notNull(),
  startTimeLocal: text("start_time_local").notNull(),
  localDate: text("local_date").notNull(),
  distanceM: real("distance_m"),
  movingTimeS: real("moving_time_s"),
  elapsedTimeS: real("elapsed_time_s"),
  elevationGainM: real("elevation_gain_m"),
  averageSpeedMps: real("average_speed_mps"),
  averageHeartRateBpm: real("average_heart_rate_bpm"),
  maxHeartRateBpm: real("max_heart_rate_bpm"),
  averageCadenceSpm: real("average_cadence_spm"),
  trainingLoad: real("training_load"),
  aerobicTrainingEffect: real("aerobic_training_effect"),
  anaerobicTrainingEffect: real("anaerobic_training_effect"),
  trainingEffectLabel: text("training_effect_label"),
  hrTimeInZonesJson: text("hr_time_in_zones_json"),
  averageTemperatureC: real("average_temperature_c"),
  lapCount: integer("lap_count"),
  /** pending | ready | failed | skipped */
  detailStatus: text("detail_status").notNull(),
  /** Métriques dérivées des séries (cf. lib/engine/activity-metrics), recalculées si la version change. */
  metricsJson: text("metrics_json"),
  metricsVersion: integer("metrics_version"),
  ...timestamps,
}, (table) => ({
  sourceUnique: uniqueIndex("activities_source_unique").on(table.source, table.sourceId),
  startIndex: index("activities_start_idx").on(table.startTimeUtc),
  sportIndex: index("activities_sport_idx").on(table.sport),
}));

export const activityDetails = sqliteTable("activity_details", {
  activityId: text("activity_id").primaryKey(),
  streamsJson: text("streams_json"),
  lapsJson: text("laps_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const wellnessDays = sqliteTable("wellness_days", {
  date: text("date").primaryKey(),
  hrvLastNightMs: real("hrv_last_night_ms"),
  hrvWeeklyAvgMs: real("hrv_weekly_avg_ms"),
  hrvBaselineLowMs: real("hrv_baseline_low_ms"),
  hrvBaselineHighMs: real("hrv_baseline_high_ms"),
  hrvStatus: text("hrv_status"),
  sleepDurationS: real("sleep_duration_s"),
  sleepScore: real("sleep_score"),
  restingHeartRateBpm: real("resting_heart_rate_bpm"),
  vo2max: real("vo2max"),
  updatedAt: text("updated_at").notNull(),
});

/** Petit magasin clé/valeur : profil athlète, curseurs de synchronisation. */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Sorties de Claude, mises en cache par sujet et empreinte des données d'entrée. */
export const coachOutputs = sqliteTable("coach_outputs", {
  id: text("id").primaryKey(),
  /** session | outlook */
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  inputHash: text("input_hash").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  outputJson: text("output_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  subjectIndex: index("coach_outputs_subject_idx").on(table.kind, table.subject, table.createdAt),
}));

/** Ressenti saisi par l'athlète sur une séance : effort perçu sur 10 et note libre. */
export const activityFeelings = sqliteTable("activity_feelings", {
  activityId: text("activity_id").primaryKey(),
  perceivedEffort: integer("perceived_effort"),
  note: text("note").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Fil « Demander au coach » (un seul fil, historique court envoyé à Claude). */
export const coachChatMessages = sqliteTable("coach_chat_messages", {
  id: text("id").primaryKey(),
  /** user | coach */
  role: text("role").notNull(),
  contentJson: text("content_json").notNull(),
  model: text("model"),
  createdAt: text("created_at").notNull(),
}, (table) => ({ createdIndex: index("coach_chat_messages_created_idx").on(table.createdAt) }));

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

export const schema = { activities, activityDetails, wellnessDays, appState, coachOutputs, activityFeelings, coachChatMessages, athleteContextVersions, goals };
