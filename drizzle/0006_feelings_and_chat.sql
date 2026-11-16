CREATE TABLE `activity_feelings` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`perceived_effort` integer,
	`note` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coach_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`content_json` text NOT NULL,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coach_chat_messages_created_idx` ON `coach_chat_messages` (`created_at`);
