CREATE TABLE `content_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`keyword` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`score` integer NOT NULL,
	`grade` text NOT NULL,
	`report` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_scans_project_created_idx` ON `content_scans` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `youtube_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text NOT NULL,
	`channel_handle` text,
	`thumbnail_url` text,
	`connected_by_user_id` text NOT NULL,
	`youtube_account_id` text NOT NULL,
	`connected_account_email` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_connections_project_channel_idx` ON `youtube_connections` (`project_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `youtube_connections_organization_idx` ON `youtube_connections` (`organization_id`);--> statement-breakpoint
CREATE INDEX `youtube_connections_connector_idx` ON `youtube_connections` (`connected_by_user_id`,`youtube_account_id`);--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_webhook_url` text;--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_position_drop` integer;--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_left_top_10` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_entered_top_3` integer DEFAULT false NOT NULL;