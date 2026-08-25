import { z } from "zod";
import { getAuth } from "@/lib/auth";
import {
  YoutubeApiError,
  YoutubeMalformedResponseError,
  YoutubeTokenError,
} from "./youtubeErrors";
import { YOUTUBE_OAUTH_PROVIDER_ID } from "@/shared/youtube";

const YOUTUBE_DATA_API_URL = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_ANALYTICS_API_URL = "https://youtubeanalytics.googleapis.com/v2";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const MAX_ERROR_BODY_LENGTH = 8_000;

const thumbnailSchema = z.object({ url: z.string().url() });
const channelSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    title: z.string().min(1),
    customUrl: z.string().optional(),
    thumbnails: z
      .object({
        default: thumbnailSchema.optional(),
        medium: thumbnailSchema.optional(),
        high: thumbnailSchema.optional(),
        standard: thumbnailSchema.optional(),
        maxres: thumbnailSchema.optional(),
      })
      .optional(),
  }),
  statistics: z
    .object({
      viewCount: z.string().regex(/^\d+$/).optional(),
      subscriberCount: z.string().regex(/^\d+$/).optional(),
      videoCount: z.string().regex(/^\d+$/).optional(),
    })
    .optional(),
});

const channelsResponseSchema = z.object({
  items: z.array(channelSchema).default([]),
});

const analyticsResponseSchema = z.object({
  columnHeaders: z.array(
    z.object({
      name: z.string().min(1),
      columnType: z.string().optional(),
      dataType: z.string().optional(),
    }),
  ),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.null()])))
    .default([]),
});

const userInfoSchema = z.object({ email: z.string().email().optional() });

export type YoutubeChannel = {
  channelId: string;
  channelName: string;
  channelHandle: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
  subscriberCount: number;
  videoCount: number;
};

export type YoutubeAnalyticsRow = {
  date: string | null;
  metrics: Record<string, number>;
};

export type YoutubeAnalyticsReport = {
  headers: string[];
  rows: YoutubeAnalyticsRow[];
};

function parseCount(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function pickThumbnail(
  thumbnails: z.infer<typeof channelSchema>["snippet"]["thumbnails"],
) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

function toYoutubeChannel(item: z.infer<typeof channelSchema>): YoutubeChannel {
  return {
    channelId: item.id,
    channelName: item.snippet.title,
    channelHandle: item.snippet.customUrl ?? null,
    thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
    viewCount: parseCount(item.statistics?.viewCount),
    subscriberCount: parseCount(item.statistics?.subscriberCount),
    videoCount: parseCount(item.statistics?.videoCount),
  };
}

function errorMessage(status: number): string {
  if (status === 401) return "YouTube connection expired.";
  if (status === 403) return "YouTube denied access to this channel.";
  if (status === 429) return "YouTube rate limit reached.";
  return `YouTube API error (${status}).`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function requestWithToken(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new YoutubeApiError(0, "YouTube is temporarily unavailable.");
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
    throw new YoutubeApiError(
      response.status,
      errorMessage(response.status),
      body,
    );
  }
  return response.json();
}

export async function discoverYoutubeChannel(
  accessToken: string,
): Promise<YoutubeChannel> {
  const url = new URL(`${YOUTUBE_DATA_API_URL}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("mine", "true");
  const parsed = channelsResponseSchema.safeParse(
    await requestWithToken(accessToken, url.toString()),
  );
  if (!parsed.success || parsed.data.items.length !== 1) {
    throw new YoutubeMalformedResponseError(
      parsed.success && parsed.data.items.length === 0
        ? "Google did not return a YouTube channel for this account."
        : "Google returned more than one YouTube channel. Connect one channel at a time.",
    );
  }
  return toYoutubeChannel(parsed.data.items[0]);
}

export async function getGoogleUserInfoEmail(
  accessToken: string,
): Promise<string | null> {
  const parsed = userInfoSchema.safeParse(
    await requestWithToken(accessToken, GOOGLE_USERINFO_URL),
  );
  return parsed.success ? (parsed.data.email ?? null) : null;
}

async function getYoutubeAccessToken(opts: {
  userId: string;
  youtubeAccountId: string;
}): Promise<string> {
  let result: { accessToken?: string } | undefined;
  try {
    result = await getAuth().api.getAccessToken({
      body: {
        providerId: YOUTUBE_OAUTH_PROVIDER_ID,
        userId: opts.userId,
        accountId: opts.youtubeAccountId,
      },
    });
  } catch (error) {
    throw new YoutubeTokenError(
      "Could not mint a YouTube access token.",
      error,
    );
  }
  if (!result?.accessToken) {
    throw new YoutubeTokenError("YouTube returned no access token.");
  }
  return result.accessToken;
}

function memoizedYoutubeAccessToken(opts: {
  userId: string;
  youtubeAccountId: string;
}) {
  let tokenPromise: Promise<string> | undefined;
  return () => (tokenPromise ??= getYoutubeAccessToken(opts));
}

function numberFromValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAnalyticsReport(
  value: unknown,
  dimension: "day" | null,
): YoutubeAnalyticsReport {
  const parsed = analyticsResponseSchema.safeParse(value);
  if (!parsed.success) throw new YoutubeMalformedResponseError();
  const headers = parsed.data.columnHeaders.map((header) => header.name);
  const dateIndex = dimension ? headers.indexOf(dimension) : -1;
  return {
    headers,
    rows: parsed.data.rows.map((row) => {
      const metrics: Record<string, number> = {};
      headers.forEach((header, index) => {
        if (index === dateIndex) return;
        metrics[header] = numberFromValue(row[index]);
      });
      return {
        date:
          dateIndex >= 0 && typeof row[dateIndex] === "string"
            ? row[dateIndex]
            : null,
        metrics,
      };
    }),
  };
}

export function createYoutubeClient(opts: {
  userId: string;
  youtubeAccountId: string;
}) {
  const accessToken = memoizedYoutubeAccessToken(opts);

  return {
    async getChannelById(channelId: string): Promise<YoutubeChannel> {
      const token = await accessToken();
      const url = new URL(`${YOUTUBE_DATA_API_URL}/channels`);
      url.searchParams.set("part", "snippet,statistics");
      url.searchParams.set("id", channelId);
      const parsed = channelsResponseSchema.safeParse(
        await requestWithToken(token, url.toString()),
      );
      if (!parsed.success || parsed.data.items.length !== 1) {
        throw new YoutubeMalformedResponseError(
          "YouTube did not return the connected channel.",
        );
      }
      return toYoutubeChannel(parsed.data.items[0]);
    },

    async queryAnalytics(input: {
      channelId: string;
      startDate: string;
      endDate: string;
      dimension?: "day";
    }): Promise<YoutubeAnalyticsReport> {
      const token = await accessToken();
      const url = new URL(`${YOUTUBE_ANALYTICS_API_URL}/reports`);
      url.searchParams.set("ids", `channel==${input.channelId}`);
      url.searchParams.set(
        "metrics",
        "views,likes,comments,subscribersGained,subscribersLost",
      );
      url.searchParams.set("startDate", input.startDate);
      url.searchParams.set("endDate", input.endDate);
      if (input.dimension) url.searchParams.set("dimensions", input.dimension);
      return normalizeAnalyticsReport(
        await requestWithToken(token, url.toString()),
        input.dimension ?? null,
      );
    },
  };
}
