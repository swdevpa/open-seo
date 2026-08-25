import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createYoutubeClient, discoverYoutubeChannel } from "./youtubeClient";
import { YoutubeMalformedResponseError } from "./youtubeErrors";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("youtubeClient", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue({ accessToken: "youtube-token" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the project-scoped grant and normalizes Analytics columns by name", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        columnHeaders: [
          { name: "comments" },
          { name: "day" },
          { name: "views" },
          { name: "likes" },
          { name: "subscribersLost" },
          { name: "subscribersGained" },
        ],
        rows: [["2", "2026-08-24", "100", "7", "1", "5"]],
      }),
    );

    const report = await createYoutubeClient({
      userId: "user-1",
      youtubeAccountId: "youtube:project-1:channel-1",
    }).queryAnalytics({
      channelId: "channel-1",
      startDate: "2026-08-01",
      endDate: "2026-08-24",
      dimension: "day",
    });

    expect(report.rows).toEqual([
      {
        date: "2026-08-24",
        metrics: {
          comments: 2,
          views: 100,
          likes: 7,
          subscribersLost: 1,
          subscribersGained: 5,
        },
      },
    ]);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: {
        providerId: "youtube",
        userId: "user-1",
        accountId: "youtube:project-1:channel-1",
      },
    });
    const request = new URL(requestUrl(mocks.fetch.mock.calls[0]?.[0]));
    expect(request.searchParams.get("ids")).toBe("channel==channel-1");
    expect(request.searchParams.get("dimensions")).toBe("day");
  });

  it("treats an empty channel response as a malformed connection", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ items: [] }));
    await expect(discoverYoutubeChannel("token")).rejects.toBeInstanceOf(
      YoutubeMalformedResponseError,
    );
  });

  it.each([401, 403, 429])("preserves upstream status %s", async (status) => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "failed" }, status));
    await expect(
      createYoutubeClient({
        userId: "user-1",
        youtubeAccountId: "youtube:project-1:channel-1",
      }).queryAnalytics({
        channelId: "channel-1",
        startDate: "2026-08-01",
        endDate: "2026-08-24",
      }),
    ).rejects.toMatchObject({ status });
  });
});
