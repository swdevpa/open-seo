import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contentParsingLive: vi.fn(
    (_requests: Array<{ url: string }>): Promise<unknown> =>
      Promise.resolve(undefined),
  ),
  fetchLiveSerp: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo/core", () => ({
  onPageApi: () => ({ contentParsingLive: mocks.contentParsingLive }),
}));

vi.mock("@/server/lib/dataforseo/serp", () => ({
  fetchLiveSerp: mocks.fetchLiveSerp,
}));

import { fetchContentOptimizationSource } from "./content-optimization";

describe("fetchContentOptimizationSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchLiveSerp.mockResolvedValue({
      data: [
        {
          type: "organic",
          rank_group: 1,
          url: "https://example.com/page",
          title: "Target",
          description: "Target description",
        },
        {
          type: "organic",
          rank_group: 2,
          url: "https://competitor.example/page",
          title: "Competitor",
          description: "Competitor description",
        },
        {
          type: "paid",
          rank_group: 1,
          url: "https://ads.example/page",
        },
      ],
      billing: {
        path: ["v3", "serp", "google", "organic", "live"],
        costUsd: 0.05,
      },
    });
    mocks.contentParsingLive.mockImplementation(
      async (requests: Array<{ url: string }>) => {
        const url = requests[0]?.url ?? "";
        const isTarget = url.includes("example.com/page");
        return {
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              path: ["v3", "on_page", "content_parsing", "live"],
              cost: 0.1,
              result: [
                {
                  items: [
                    {
                      page_as_markdown: isTarget
                        ? "# Target\n\n## Section\ncontent optimization guide [Link](https://example.com/other) [Source](https://external.example/source)"
                        : "# Competitor\n\n## Topic\ncontent optimization strategy guide",
                    },
                  ],
                },
              ],
            },
          ],
        };
      },
    );
  });

  it("parses the target and organic competitors and aggregates billing", async () => {
    const result = await fetchContentOptimizationSource({
      url: "https://example.com/page#section",
      keyword: "content optimization",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(mocks.fetchLiveSerp).toHaveBeenCalledWith({
      keyword: "content optimization",
      locationCode: 2840,
      languageCode: "en",
      depth: 10,
    });
    expect(mocks.contentParsingLive).toHaveBeenCalledTimes(2);
    const firstRequest = mocks.contentParsingLive.mock.calls[0]?.[0];
    expect(firstRequest?.[0]).toMatchObject({
      markdown_view: true,
      disable_cookie_popup: true,
    });
    expect(result.billing.costUsd).toBeCloseTo(0.25, 10);
    expect(result.data.target).toMatchObject({
      url: "https://example.com/page#section",
      h1Count: 1,
      h2Count: 1,
      keywordFrequency: 1,
      internalLinkCount: 1,
      externalLinkCount: 1,
    });
    expect(result.data.competitors).toHaveLength(1);
    expect(result.data.competitors[0]?.page?.h1Count).toBe(1);
  });
});
