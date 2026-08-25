CREATE TABLE `activity_details_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`intervals_activity_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`intervals_json` text,
	`source_updated_at` text,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_details_cache_activity_unique` ON `activity_details_cache` (`intervals_activity_id`);--> statement-breakpoint
CREATE TABLE `activity_stream_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`intervals_activity_id` text NOT NULL,
	`stream_version` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_stream_summaries_activity_version_unique` ON `activity_stream_summaries` (`intervals_activity_id`,`stream_version`);--> statement-breakpoint
CREATE INDEX `activity_stream_summaries_activity_idx` ON `activity_stream_summaries` (`intervals_activity_id`);--> statement-breakpoint
CREATE TABLE `athlete_context_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`context_json` text NOT NULL,
	`source_text` text,
	`created_at` text NOT NULL,
	`activated_at` text,
	`archived_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `athlete_context_versions_status_idx` ON `athlete_context_versions` (`status`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text,
	`target_date` text,
	`target_value` real,
	`target_unit` text,
	`description` text,
	`definition_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_status_idx` ON `goals` (`status`);--> statement-breakpoint
CREATE INDEX `goals_priority_idx` ON `goals` (`priority`);--> statement-breakpoint
CREATE INDEX `goals_target_date_idx` ON `goals` (`target_date`);--> statement-breakpoint
CREATE TABLE `manual_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_date` text NOT NULL,
	`discipline` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`label` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manual_sessions_session_date_idx` ON `manual_sessions` (`session_date`);--> statement-breakpoint
CREATE INDEX `manual_sessions_discipline_idx` ON `manual_sessions` (`discipline`);--> statement-breakpoint
CREATE TABLE `synced_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`intervals_activity_id` text NOT NULL,
	`start_date` text NOT NULL,
	`timezone` text,
	`name` text,
	`sport_type` text NOT NULL,
	`distance_m` real,
	`moving_time_s` integer,
	`elapsed_time_s` integer,
	`elevation_gain_m` real,
	`average_speed_mps` real,
	`average_heart_rate_bpm` real,
	`max_heart_rate_bpm` real,
	`average_cadence_spm` real,
	`average_power_w` real,
	`training_load` real,
	`source_updated_at` text,
	`synced_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `synced_activities_intervals_activity_id_unique` ON `synced_activities` (`intervals_activity_id`);--> statement-breakpoint
CREATE INDEX `synced_activities_start_date_idx` ON `synced_activities` (`start_date`);--> statement-breakpoint
CREATE INDEX `synced_activities_sport_type_idx` ON `synced_activities` (`sport_type`);--> statement-breakpoint
CREATE TABLE `user_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`confirmation_type` text NOT NULL,
	`status` text NOT NULL,
	`source_activity_id` text,
	`source_segment_id` text,
	`detection_confidence` text NOT NULL,
	`proposed_payload_json` text NOT NULL,
	`resolved_payload_json` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_confirmations_status_idx` ON `user_confirmations` (`status`);--> statement-breakpoint
CREATE INDEX `user_confirmations_source_activity_idx` ON `user_confirmations` (`source_activity_id`);--> statement-breakpoint
CREATE INDEX `user_confirmations_type_status_idx` ON `user_confirmations` (`confirmation_type`,`status`);