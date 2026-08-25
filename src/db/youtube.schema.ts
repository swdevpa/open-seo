import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

// OAuth tokens stay encrypted in Better Auth's account table. This table is
// project-scoped so the same channel can be connected to separate projects.
export const youtubeConnections = sqliteTable(
  "youtube_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    channelHandle: text("channel_handle"),
    thumbnailUrl: text("thumbnail_url"),
    connectedByUserId: text("connected_by_user_id").notNull(),
    youtubeAccountId: text("youtube_account_id").notNull(),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("youtube_connections_project_channel_idx").on(
      table.projectId,
      table.channelId,
    ),
    index("youtube_connections_organization_idx").on(table.organizationId),
    index("youtube_connections_connector_idx").on(
      table.connectedByUserId,
      table.youtubeAccountId,
    ),
  ],
);
