import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentScans } from "@/db/schema";

export type ContentScanRecord = typeof contentScans.$inferSelect;

export type ContentScanListRecord = Pick<
  ContentScanRecord,
  | "id"
  | "url"
  | "keyword"
  | "locationCode"
  | "languageCode"
  | "score"
  | "grade"
  | "createdAt"
>;

async function insert(
  values: typeof contentScans.$inferInsert,
): Promise<ContentScanRecord> {
  const [row] = await db.insert(contentScans).values(values).returning();
  if (!row) throw new Error("Failed to insert content_scan");
  return row;
}

async function listForProject(
  projectId: string,
): Promise<ContentScanListRecord[]> {
  return db
    .select({
      id: contentScans.id,
      url: contentScans.url,
      keyword: contentScans.keyword,
      locationCode: contentScans.locationCode,
      languageCode: contentScans.languageCode,
      score: contentScans.score,
      grade: contentScans.grade,
      createdAt: contentScans.createdAt,
    })
    .from(contentScans)
    .where(eq(contentScans.projectId, projectId))
    .orderBy(desc(contentScans.createdAt))
    .limit(20);
}

async function getById(
  projectId: string,
  id: string,
): Promise<ContentScanRecord | null> {
  const rows = await db
    .select()
    .from(contentScans)
    .where(and(eq(contentScans.projectId, projectId), eq(contentScans.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

async function deleteById(projectId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(contentScans)
    .where(and(eq(contentScans.projectId, projectId), eq(contentScans.id, id)))
    .returning({ id: contentScans.id });
  return rows.length > 0;
}

export const ContentScanRepository = {
  insert,
  listForProject,
  getById,
  deleteById,
};
