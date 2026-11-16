CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`source_type` text NOT NULL,
	`start_time_utc` text NOT NULL,
	`start_time_local` text NOT NULL,
	`local_date` text NOT NULL,
	`distance_m` real,
	`moving_time_s` real,
	`elapsed_time_s` real,
	`elevation_gain_m` real,
	`average_speed_mps` real,
	`average_heart_rate_bpm` real,
	`max_heart_rate_bpm` real,
	`average_cadence_spm` real,
	`training_load` real,
	`aerobic_training_effect` real,
	`anaerobic_training_effect` real,
	`training_effect_label` text,
	`hr_time_in_zones_json` text,
	`average_temperature_c` real,
	`lap_count` integer,
	`detail_status` text NOT NULL,
	`metrics_json` text,
	`metrics_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_source_unique` ON `activities` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `activities_start_idx` ON `activities` (`start_time_utc`);--> statement-breakpoint
CREATE INDEX `activities_sport_idx` ON `activities` (`sport`);--> statement-breakpoint
CREATE TABLE `activity_details` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`streams_json` text,
	`laps_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wellness_days` (
	`date` text PRIMARY KEY NOT NULL,
	`hrv_last_night_ms` real,
	`hrv_weekly_avg_ms` real,
	`hrv_baseline_low_ms` real,
	`hrv_baseline_high_ms` real,
	`hrv_status` text,
	`sleep_duration_s` real,
	`sleep_score` real,
	`resting_heart_rate_bpm` real,
	`vo2max` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coach_outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`input_hash` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`output_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coach_outputs_subject_idx` ON `coach_outputs` (`kind`,`subject`,`created_at`);
