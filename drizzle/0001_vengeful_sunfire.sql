CREATE TABLE `action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `action_items_analysis_idx` ON `action_items` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `activity_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`intervals_activity_id` text NOT NULL,
	`session_goal` text,
	`perceived_exertion` text,
	`unusual_fatigue` integer DEFAULT 0,
	`pain_flag` integer DEFAULT 0,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_contexts_activity_idx` ON `activity_contexts` (`intervals_activity_id`);--> statement-breakpoint
CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`intervals_activity_id` text NOT NULL,
	`deterministic_metrics_json` text NOT NULL,
	`historical_comparison_json` text,
	`llm_response_json` text NOT NULL,
	`llm_model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analyses_activity_idx` ON `analyses` (`intervals_activity_id`);