ALTER TABLE "rank_tracking_configs" ADD COLUMN "alert_webhook_url" text;--> statement-breakpoint
ALTER TABLE "rank_tracking_configs" ADD COLUMN "alert_position_drop" integer;--> statement-breakpoint
ALTER TABLE "rank_tracking_configs" ADD COLUMN "alert_left_top_10" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_tracking_configs" ADD COLUMN "alert_entered_top_3" boolean DEFAULT false NOT NULL;