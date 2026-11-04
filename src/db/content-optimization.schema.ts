import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// Stored content optimization reports. The report JSON is versioned in the
// shared schema so old scans remain readable when the report shape changes.
export const contentScans = sqliteTable(
  "content_scans",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    score: integer("score").notNull(),
    grade: text("grade").notNull(),
    report: text("report").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("content_scans_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
