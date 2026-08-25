import { beforeEach, describe, expect, it, vi } from "vitest";
import { YoutubeApiError } from "@/server/lib/youtubeErrors";
import { YoutubeService } from "./YoutubeService";

const mocks = vi.hoisted(() => ({
  listByProjectId: vi.fn(),
  getByProjectAndChannelId: vi.fn(),
  createYoutubeClient: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  account: {
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
  },
}));
vi.mock("../repositories/YoutubeConnectionRepository", () => ({
  YoutubeConnectionRepository: {
    listByProjectId: mocks.listByProjectId,
    getByProjectAndChannelId: mocks.getByProjectAndChannelId,
  },
}));
vi.mock("@/server/lib/youtubeClient", () => ({
  createYoutubeClient: mocks.createYoutubeClient,
}));

function connection(channelId: string, accountId: string) {
  return {
    id: `connection-${channelId}`,
    projectId: "project-1",
    organizationId: "org-1",
    channelId,
    channelName: `Channel ${channelId}`,
    channelHandle: `@${channelId}`,
    thumbnailUrl: null,
    connectedByUserId: "user-1",
    youtubeAccountId: accountId,
    connectedAccountEmail: "google@example.com",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const channel = {
  channelId: "channel-a",
  channelName: "Channel A",
  channelHandle: "@channel-a",
  thumbnailUrl: null,
  viewCount: 1000,
  subscriberCount: 50,
  videoCount: 12,
};

const emptyReport = { headers: [], rows: [] };

describe("YoutubeService", () => {
  beforeEach(() => {
    mocks.listByProjectId.mockReset();
    mocks.getByProjectAndChannelId.mockReset();
    mocks.createYoutubeClient.mockReset();
  });

  it("keeps one unavailable channel from blocking another channel", async () => {
    const first = connection("channel-a", "youtube:project-1:channel-a");
    const second = connection("channel-b", "youtube:project-1:channel-b");
    mocks.listByProjectId.mockResolvedValue([first, second]);
    mocks.createYoutubeClient.mockImplementation(
      ({ youtubeAccountId }: { youtubeAccountId: string }) => {
        if (youtubeAccountId.endsWith("channel-b")) {
          return {
            getChannelById: vi
              .fn()
              .mockRejectedValue(new YoutubeApiError(401, "expired")),
            queryAnalytics: vi
              .fn()
              .mockRejectedValue(new YoutubeApiError(401, "expired")),
          };
        }
        return {
          getChannelById: vi.fn().mockResolvedValue(channel),
          queryAnalytics: vi.fn().mockResolvedValue(emptyReport),
        };
      },
    );

    const result = await YoutubeService.getOverview({
      projectId: "project-1",
      startDate: "2026-08-01",
      endDate: "2026-08-24",
    });

    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]).toMatchObject({
      channelId: "channel-a",
      status: "connected",
      current: { subscriberCount: 50 },
      period: {
        views: 0,
        likes: 0,
        comments: 0,
        netSubscribers: 0,
      },
    });
    expect(result.channels[1]).toMatchObject({
      channelId: "channel-b",
      status: "reconnect",
    });
    expect(result.seriesCoverage).toEqual({
      includedChannels: 1,
      totalChannels: 2,
    });
  });

  it("sums daily activity across channels for the overview chart", async () => {
    const first = connection("channel-a", "youtube:project-1:channel-a");
    const second = connection("channel-b", "youtube:project-1:channel-b");
    mocks.listByProjectId.mockResolvedValue([first, second]);
    const reports = new Map([
      [
        first.youtubeAccountId,
        {
          headers: ["day", "views", "engagedViews"],
          rows: [
            {
              date: "2026-08-01",
              metrics: {
                views: 3,
                engagedViews: 2,
                likes: 1,
                comments: 0,
                subscribersGained: 2,
                subscribersLost: 0,
              },
            },
            {
              date: "2026-08-03",
              metrics: {
                views: 5,
                engagedViews: 3,
                likes: 2,
                comments: 1,
                subscribersGained: 0,
                subscribersLost: 1,
              },
            },
          ],
        },
      ],
      [
        second.youtubeAccountId,
        {
          headers: ["day", "views", "engagedViews"],
          rows: [
            {
              date: "2026-08-01",
              metrics: {
                views: 10,
                engagedViews: 6,
                likes: 4,
                comments: 1,
                subscribersGained: 1,
                subscribersLost: 0,
              },
            },
            {
              date: "2026-08-02",
              metrics: {
                views: 4,
                engagedViews: 2,
                likes: 1,
                comments: 0,
                subscribersGained: 0,
                subscribersLost: 0,
              },
            },
          ],
        },
      ],
    ]);
    mocks.createYoutubeClient.mockImplementation(
      ({ youtubeAccountId }: { youtubeAccountId: string }) => ({
        getChannelById: vi.fn().mockResolvedValue(channel),
        queryAnalytics: vi
          .fn()
          .mockImplementation(({ dimension }: { dimension?: "day" }) =>
            Promise.resolve(
              dimension === "day"
                ? (reports.get(youtubeAccountId) ?? emptyReport)
                : emptyReport,
            ),
          ),
      }),
    );

    const result = await YoutubeService.getOverview({
      projectId: "project-1",
      startDate: "2026-08-01",
      endDate: "2026-08-04",
    });

    expect(result.seriesGranularity).toBe("day");
    expect(result.seriesCoverage).toEqual({
      includedChannels: 2,
      totalChannels: 2,
    });
    expect(result.series).toEqual([
      {
        date: "2026-08-01",
        views: 13,
        engagedViews: 8,
        likes: 5,
        comments: 1,
        subscribersGained: 3,
        subscribersLost: 0,
        netSubscribers: 3,
      },
      {
        date: "2026-08-02",
        views: 4,
        engagedViews: 2,
        likes: 1,
        comments: 0,
        subscribersGained: 0,
        subscribersLost: 0,
        netSubscribers: 0,
      },
      {
        date: "2026-08-03",
        views: 5,
        engagedViews: 3,
        likes: 2,
        comments: 1,
        subscribersGained: 0,
        subscribersLost: 1,
        netSubscribers: -1,
      },
      {
        date: "2026-08-04",
        views: 0,
        engagedViews: 0,
        likes: 0,
        comments: 0,
        subscribersGained: 0,
        subscribersLost: 0,
        netSubscribers: 0,
      },
    ]);
    expect(result.channels[0].period).toMatchObject({
      views: 8,
      engagedViews: 5,
      likes: 3,
      comments: 1,
      netSubscribers: 1,
    });
  });

  it("fills missing daily rows and groups long ranges by month", async () => {
    const stored = connection("channel-a", "youtube:project-1:channel-a");
    mocks.getByProjectAndChannelId.mockResolvedValue(stored);
    mocks.createYoutubeClient.mockReturnValue({
      getChannelById: vi.fn().mockResolvedValue(channel),
      queryAnalytics: vi.fn().mockResolvedValue(emptyReport),
    });

    const result = await YoutubeService.getChannelDetail({
      projectId: "project-1",
      channelId: "channel-a",
      startDate: "2025-01-01",
      endDate: "2026-08-24",
    });

    expect(result.seriesGranularity).toBe("month");
    expect(result.series.length).toBeGreaterThan(12);
    expect(result.series.every((row) => row.views === 0)).toBe(true);
    expect(result.period).toMatchObject({
      views: 0,
      likes: 0,
      comments: 0,
      netSubscribers: 0,
    });
  });
});
