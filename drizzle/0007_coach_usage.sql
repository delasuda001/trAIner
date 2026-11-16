CREATE TABLE `coach_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text,
	`model` text NOT NULL,
	`outcome` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_creation_tokens` integer NOT NULL,
	`cost_usd` real,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE INDEX `coach_usage_created_idx` ON `coach_usage` (`created_at`);
