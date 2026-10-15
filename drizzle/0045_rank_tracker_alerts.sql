ALTER TABLE `rank_tracking_configs` ADD `alert_webhook_url` text;--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_position_drop` integer;--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_left_top_10` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rank_tracking_configs` ADD `alert_entered_top_3` integer DEFAULT false NOT NULL;