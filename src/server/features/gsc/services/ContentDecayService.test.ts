import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentDecayService } from "./ContentDecayService";

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn(),
  getLatestAudit: vi.fn(),
  getAuditPages: vi.fn(),
}));

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getLatestAuditForProject: mocks.getLatestAudit,
    getPagesForAudit: mocks.getAuditPages,
  },
}));

const NOW = new Date("2026-10-15T00:00:00Z");

const row = (keys: string[], clicks: number, position = 5) => ({
  keys,
  clicks,
  impressions: clicks * 10,
  ctr: 0.1,
  position,
});

// Clicks per page for June (baseline) through September.
const monthlyClicks: Record<string, Record<string, number>> = {
  "2026-06-01": { "/decaying": 100, "/rebound": 100, "/tiny": 8 },
  "2026-07-01": { "/decaying": 80, "/rebound": 60, "/tiny": 5 },
  "2026-08-01": { "/decaying": 50, "/rebound": 90, "/tiny": 3 },
  "2026-09-01": { "/decaying": 20, "/rebound": 40, "/tiny": 1 },
};

describe("ContentDecayService.getContentDecay", () => {
  beforeEach(() => {
    mocks.getPerformance.mockImplementation(
      (input: { dimensions: string[]; startDate: string }) => {
        if (input.dimensions.length === 2) {
          return Promise.resolve({
            rows: [
              row(["https://example.com/decaying", "best query"], 90),
              row(["https://example.com/decaying", "second query"], 10),
            ],
          });
        }
        const clicks = monthlyClicks[input.startDate] ?? {};
        return Promise.resolve({
          rows: Object.entries(clicks).map(([path, value]) =>
            row([`https://example.com${path}`], value, 8.5),
          ),
        });
      },
    );
    mocks.getLatestAudit.mockResolvedValue({ id: "audit_1" });
    mocks.getAuditPages.mockResolvedValue([
      { url: "https://example.com/decaying/", wordCount: 640 },
    ]);
  });

  it("keeps only pages that lost clicks every month above the noise floor", async () => {
    const result = await ContentDecayService.getContentDecay(
      { projectId: "p1", months: 3 },
      { now: NOW },
    );

    expect(result.months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(result.rows).toEqual([
      {
        page: "https://example.com/decaying",
        monthlyClicks: [100, 80, 50, 20],
        totalLoss: 80,
        lossPercent: 80,
        position: 8.5,
        topQuery: "best query",
        wordCount: 640,
      },
    ]);
  });
});
