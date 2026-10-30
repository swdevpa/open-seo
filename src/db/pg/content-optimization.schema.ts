import { sql } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep this definition structurally identical to ../content-optimization.schema.ts.
export const contentScans = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("content_scans_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
