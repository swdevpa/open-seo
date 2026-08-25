import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { YOUTUBE_OAUTH_PROVIDER_ID } from "@/shared/youtube";
import type { YoutubeMetrics as SharedYoutubeMetrics } from "@/shared/youtube";
import {
  createYoutubeClient,
  type YoutubeAnalyticsReport,
  type YoutubeChannel,
} from "@/server/lib/youtubeClient";
import { YoutubeApiError, YoutubeTokenError } from "@/server/lib/youtubeErrors";
import { AppError } from "@/server/lib/errors";
import {
  YoutubeConnectionRepository,
  type YoutubeConnection,
} from "../repositories/YoutubeConnectionRepository";
import { resolveYoutubeDateRange, type YoutubeDateRange } from "./YoutubeDates";

export type YoutubeMetrics = SharedYoutubeMetrics;

type YoutubeConnectionStatus = "connected" | "reconnect" | "unavailable";

export type YoutubeOverviewItem = {
  channelId: string;
  channelName: string;
  channelHandle: string | null;
  thumbnailUrl: string | null;
  connectedAccountEmail: string | null;
  status: YoutubeConnectionStatus;
  current: {
    viewCount: number;
    subscriberCount: number;
    videoCount: number;
  } | null;
  period: YoutubeMetrics | null;
};

export type YoutubeOverview = {
  range: YoutubeDateRange;
  channels: YoutubeOverviewItem[];
};

export type YoutubeChannelDetail = YoutubeOverviewItem & {
  range: YoutubeDateRange;
  series: Array<YoutubeMetrics & { date: string }>;
  seriesGranularity: "day" | "week" | "month";
};

const EMPTY_METRICS: YoutubeMetrics = {
  views: 0,
  engagedViews: 0,
  likes: 0,
  comments: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  netSubscribers: 0,
};

function metricsFromValues(values: Record<string, number>): YoutubeMetrics {
  const metrics = {
    views: values.views ?? 0,
    engagedViews: values.engagedViews ?? 0,
    likes: values.likes ?? 0,
    comments: values.comments ?? 0,
    subscribersGained: values.subscribersGained ?? 0,
    subscribersLost: values.subscribersLost ?? 0,
    netSubscribers: 0,
  };
  metrics.netSubscribers = metrics.subscribersGained - metrics.subscribersLost;
  return metrics;
}

function addMetrics(target: YoutubeMetrics, source: YoutubeMetrics): void {
  target.views += source.views;
  target.engagedViews += source.engagedViews;
  target.likes += source.likes;
  target.comments += source.comments;
  target.subscribersGained += source.subscribersGained;
  target.subscribersLost += source.subscribersLost;
  target.netSubscribers = target.subscribersGained - target.subscribersLost;
}

function aggregateReport(report: YoutubeAnalyticsReport): YoutubeMetrics {
  const result = { ...EMPTY_METRICS };
  for (const row of report.rows)
    addMetrics(result, metricsFromValues(row.metrics));
  return result;
}

function isReconnectError(error: unknown): boolean {
  return (
    error instanceof YoutubeTokenError ||
    (error instanceof YoutubeApiError &&
      (error.status === 401 || error.status === 403))
  );
}

function statusForErrors(errors: unknown[]): YoutubeConnectionStatus {
  if (errors.some(isReconnectError)) return "reconnect";
  if (errors.length > 0) return "unavailable";
  return "connected";
}

function logUnexpectedFailure(error: unknown, channelId: string): void {
  if (isReconnectError(error)) return;
  console.error("youtube.channel_data_failed", {
    channelId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    status: error instanceof YoutubeApiError ? error.status : undefined,
  });
}

function connectionClient(connection: YoutubeConnection) {
  return createYoutubeClient({
    userId: connection.connectedByUserId,
    youtubeAccountId: connection.youtubeAccountId,
  });
}

async function loadChannelData(
  connection: YoutubeConnection,
  range: YoutubeDateRange,
) {
  const client = connectionClient(connection);
  const [channelResult, analyticsResult] = await Promise.allSettled([
    client.getChannelById(connection.channelId),
    client.queryAnalytics({
      channelId: connection.channelId,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  ]);
  const errors: unknown[] = [];
  for (const result of [channelResult, analyticsResult]) {
    if (result.status === "rejected") errors.push(result.reason as unknown);
  }
  errors.forEach((error) => logUnexpectedFailure(error, connection.channelId));
  return {
    status: statusForErrors(errors),
    channel: channelResult.status === "fulfilled" ? channelResult.value : null,
    period:
      analyticsResult.status === "fulfilled"
        ? aggregateReport(analyticsResult.value)
        : null,
  };
}

function baseItem(connection: YoutubeConnection): YoutubeOverviewItem {
  return {
    channelId: connection.channelId,
    channelName: connection.channelName,
    channelHandle: connection.channelHandle,
    thumbnailUrl: connection.thumbnailUrl,
    connectedAccountEmail: connection.connectedAccountEmail,
    status: "connected",
    current: null,
    period: null,
  };
}

function applyChannel(
  item: YoutubeOverviewItem,
  channel: YoutubeChannel | null,
) {
  if (!channel) return;
  item.channelName = channel.channelName;
  item.channelHandle = channel.channelHandle;
  item.thumbnailUrl = channel.thumbnailUrl;
  item.current = {
    viewCount: channel.viewCount,
    subscriberCount: channel.subscriberCount,
    videoCount: channel.videoCount,
  };
}

async function getOverview(input: {
  projectId: string;
  startDate?: string;
  endDate?: string;
}): Promise<YoutubeOverview> {
  const range = resolveYoutubeDateRange(input);
  const connections = await YoutubeConnectionRepository.listByProjectId(
    input.projectId,
  );
  const channels = await Promise.all(
    connections.map(async (connection) => {
      const item = baseItem(connection);
      const data = await loadChannelData(connection, range);
      item.status = data.status;
      applyChannel(item, data.channel);
      item.period = data.period;
      return item;
    }),
  );
  return { range, channels };
}

function dateRangeDates(range: YoutubeDateRange): Date[] {
  const dates: Date[] = [];
  const firstDate = new Date(`${range.startDate}T00:00:00.000Z`);
  for (let dayIndex = 0; dayIndex < rangeDays(range); dayIndex += 1) {
    const current = new Date(firstDate);
    current.setUTCDate(current.getUTCDate() + dayIndex);
    dates.push(current);
  }
  return dates;
}

function rangeDays(range: YoutubeDateRange): number {
  return (
    (new Date(`${range.endDate}T00:00:00.000Z`).getTime() -
      new Date(`${range.startDate}T00:00:00.000Z`).getTime()) /
      86_400_000 +
    1
  );
}

function seriesGranularity(range: YoutubeDateRange): "day" | "week" | "month" {
  const days = rangeDays(range);
  if (days > 366) return "month";
  if (days > 90) return "week";
  return "day";
}

function mondayOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result;
}

function periodKey(date: Date, granularity: "day" | "week" | "month"): string {
  if (granularity === "day") return date.toISOString().slice(0, 10);
  if (granularity === "month") return date.toISOString().slice(0, 7);
  return mondayOfWeek(date).toISOString().slice(0, 10);
}

function buildSeries(report: YoutubeAnalyticsReport, range: YoutubeDateRange) {
  const granularity = seriesGranularity(range);
  const rowByDate = new Map(
    report.rows
      .filter((row): row is typeof row & { date: string } => Boolean(row.date))
      .map((row) => [row.date, metricsFromValues(row.metrics)]),
  );
  const grouped = new Map<string, YoutubeMetrics>();
  for (const date of dateRangeDates(range)) {
    const dateValue = date.toISOString().slice(0, 10);
    const key = periodKey(date, granularity);
    const target = grouped.get(key) ?? { ...EMPTY_METRICS };
    addMetrics(target, rowByDate.get(dateValue) ?? EMPTY_METRICS);
    grouped.set(key, target);
  }
  return {
    granularity,
    series: [...grouped.entries()].map(([date, metrics]) => ({
      date,
      ...metrics,
    })),
  };
}

async function getChannelDetail(input: {
  projectId: string;
  channelId: string;
  startDate?: string;
  endDate?: string;
}): Promise<YoutubeChannelDetail> {
  const range = resolveYoutubeDateRange(input);
  const connection = await YoutubeConnectionRepository.getByProjectAndChannelId(
    input.projectId,
    input.channelId,
  );
  if (!connection) throw new AppError("NOT_FOUND");

  const client = connectionClient(connection);
  const [channelResult, aggregateResult, dailyResult] =
    await Promise.allSettled([
      client.getChannelById(connection.channelId),
      client.queryAnalytics({
        channelId: connection.channelId,
        startDate: range.startDate,
        endDate: range.endDate,
      }),
      client.queryAnalytics({
        channelId: connection.channelId,
        startDate: range.startDate,
        endDate: range.endDate,
        dimension: "day",
      }),
    ]);
  const errors: unknown[] = [];
  for (const result of [channelResult, aggregateResult, dailyResult]) {
    if (result.status === "rejected") errors.push(result.reason as unknown);
  }
  errors.forEach((error) => logUnexpectedFailure(error, connection.channelId));

  const item = baseItem(connection);
  item.status = statusForErrors(errors);
  applyChannel(
    item,
    channelResult.status === "fulfilled" ? channelResult.value : null,
  );
  item.period =
    aggregateResult.status === "fulfilled"
      ? aggregateReport(aggregateResult.value)
      : null;
  const chart =
    dailyResult.status === "fulfilled"
      ? buildSeries(dailyResult.value, range)
      : { granularity: seriesGranularity(range), series: [] };
  return {
    ...item,
    range,
    series: chart.series,
    seriesGranularity: chart.granularity,
  };
}

async function disconnect(input: {
  projectId: string;
  channelId: string;
  userId: string;
}): Promise<void> {
  const connection = await YoutubeConnectionRepository.getByProjectAndChannelId(
    input.projectId,
    input.channelId,
  );
  await YoutubeConnectionRepository.deleteByProjectAndChannelId(
    input.projectId,
    input.channelId,
  );
  if (
    connection?.connectedByUserId === input.userId &&
    connection.youtubeAccountId
  ) {
    const stillUsed =
      await YoutubeConnectionRepository.existsForConnectorAccount(
        input.userId,
        connection.youtubeAccountId,
      );
    if (!stillUsed) {
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, input.userId),
            eq(account.providerId, YOUTUBE_OAUTH_PROVIDER_ID),
            eq(account.accountId, connection.youtubeAccountId),
          ),
        );
    }
  }
}

async function saveConnection(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  channel: YoutubeChannel;
  connectedAccountEmail: string | null;
}) {
  return YoutubeConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    channelId: input.channel.channelId,
    channelName: input.channel.channelName,
    channelHandle: input.channel.channelHandle,
    thumbnailUrl: input.channel.thumbnailUrl,
    connectedByUserId: input.userId,
    youtubeAccountId: getYoutubeGrantAccountId(
      input.projectId,
      input.channel.channelId,
    ),
    connectedAccountEmail: input.connectedAccountEmail,
  });
}

export function getYoutubeGrantAccountId(
  projectId: string,
  channelId: string,
): string {
  return `youtube:${projectId}:${channelId}`;
}

export const YoutubeService = {
  getOverview,
  getChannelDetail,
  disconnect,
  saveConnection,
};
