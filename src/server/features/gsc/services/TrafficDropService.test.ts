import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficDropService } from "./TrafficDropService";

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn(),
  getLatestAudit: vi.fn(),
  getAuditPages: vi.fn(),
  getGa4Connection: vi.fn(),
  runGa4Report: vi.fn(),
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
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: { getByProjectId: mocks.getGa4Connection },
}));
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: { runReport: mocks.runGa4Report },
}));

const CURRENT = { startDate: "2026-09-01", endDate: "2026-09-28" };

const row = (
  key: string,
  clicks: number,
  impressions: number,
  position = 3,
) => ({
  keys: [key],
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
});

// [previous, current] rows per dimension.
const gscRows = {
  date: [[row("d", 300, 3000)], [row("d", 120, 2000)]],
  query: [
    [row("ranked", 100, 1000, 3), row("seasonal", 50, 1000, 2)],
    [row("ranked", 20, 900, 9), row("seasonal", 25, 500, 2)],
  ],
  page: [
    [row("https://example.com/pricing", 120, 1500)],
    [row("https://example.com/pricing", 30, 1200)],
  ],
};

function ga4Report(sessions: number) {
  return {
    rows: [{ hostName: "example.com", landingPage: "/pricing", sessions }],
  };
}

describe("TrafficDropService.diagnose", () => {
  beforeEach(() => {
    mocks.getPerformance.mockImplementation(
      (input: { dimensions: ["date" | "query" | "page"]; startDate: string }) =>
        Promise.resolve({
          rows: gscRows[input.dimensions[0]][
            input.startDate === CURRENT.startDate ? 1 : 0
          ],
        }),
    );
    mocks.getLatestAudit.mockResolvedValue({
      id: "audit_1",
      status: "completed",
      startedAt: "2026-09-20",
    });
    mocks.getAuditPages.mockResolvedValue([
      {
        url: "https://example.com/pricing/",
        statusCode: 200,
        fetchClass: "ok",
        isIndexable: false,
        canonicalUrl: null,
        headerCanonicalUrl: null,
      },
    ]);
    mocks.getGa4Connection.mockResolvedValue(null);
  });

  it("separates ranking loss from demand drop and flags noindex losing pages", async () => {
    const result = await TrafficDropService.diagnose({
      projectId: "p1",
      ...CURRENT,
    });

    expect(result.previousPeriod).toEqual({
      startDate: "2026-08-04",
      endDate: "2026-08-31",
    });
    expect(result.losingQueries.map((loss) => [loss.key, loss.reason])).toEqual(
      [
        ["ranked", "position_drop"],
        ["seasonal", "demand_drop"],
      ],
    );
    expect(result.pageChecks[0]?.audit?.flags).toEqual(["noindex"]);
    expect(result.causes.map((cause) => cause.cause)).toEqual([
      "technical_indexing",
      "ranking_loss",
      "demand_drop",
    ]);
    expect(result.diagnostics.join(" ")).toContain(
      "Google Analytics is not connected",
    );
  });

  it("flags a measurement issue when GA4 sessions fall far more than clicks", async () => {
    mocks.getGa4Connection.mockResolvedValue({ propertyId: "properties/1" });
    mocks.runGa4Report.mockImplementation((input: { startDate: string }) =>
      Promise.resolve(
        ga4Report(input.startDate === CURRENT.startDate ? 10 : 400),
      ),
    );

    const result = await TrafficDropService.diagnose({
      projectId: "p1",
      ...CURRENT,
    });

    expect(result.causes.map((cause) => cause.cause)).toContain("measurement");
    expect(result.pageChecks[0]?.ga4).toMatchObject({
      previousSessions: 400,
      currentSessions: 10,
    });
  });
});
