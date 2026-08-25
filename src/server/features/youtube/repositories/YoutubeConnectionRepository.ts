import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";

export type YoutubeConnection = typeof youtubeConnections.$inferSelect;

async function listByProjectId(
  projectId: string,
): Promise<YoutubeConnection[]> {
  return db
    .select()
    .from(youtubeConnections)
    .where(eq(youtubeConnections.projectId, projectId))
    .orderBy(youtubeConnections.channelName);
}

async function getByProjectAndChannelId(
  projectId: string,
  channelId: string,
): Promise<YoutubeConnection | null> {
  const rows = await db
    .select()
    .from(youtubeConnections)
    .where(
      and(
        eq(youtubeConnections.projectId, projectId),
        eq(youtubeConnections.channelId, channelId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  channelId: string;
  channelName: string;
  channelHandle: string | null;
  thumbnailUrl: string | null;
  connectedByUserId: string;
  youtubeAccountId: string;
  connectedAccountEmail: string | null;
}): Promise<YoutubeConnection> {
  const [row] = await db
    .insert(youtubeConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: [youtubeConnections.projectId, youtubeConnections.channelId],
      set: {
        organizationId: input.organizationId,
        channelName: input.channelName,
        channelHandle: input.channelHandle,
        thumbnailUrl: input.thumbnailUrl,
        connectedByUserId: input.connectedByUserId,
        youtubeAccountId: input.youtubeAccountId,
        connectedAccountEmail: sql`coalesce(${input.connectedAccountEmail}, ${youtubeConnections.connectedAccountEmail})`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert youtube_connection");
  return row;
}

async function deleteByProjectAndChannelId(
  projectId: string,
  channelId: string,
): Promise<void> {
  await db
    .delete(youtubeConnections)
    .where(
      and(
        eq(youtubeConnections.projectId, projectId),
        eq(youtubeConnections.channelId, channelId),
      ),
    );
}

async function existsForConnectorAccount(
  userId: string,
  youtubeAccountId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: youtubeConnections.id })
    .from(youtubeConnections)
    .where(
      and(
        eq(youtubeConnections.connectedByUserId, userId),
        eq(youtubeConnections.youtubeAccountId, youtubeAccountId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const YoutubeConnectionRepository = {
  listByProjectId,
  getByProjectAndChannelId,
  upsert,
  deleteByProjectAndChannelId,
  existsForConnectorAccount,
};
