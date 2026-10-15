import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankAlertService } from "./RankAlertService";

const mocks = vi.hoisted(() => ({
  getConfigById: vi.fn(),
  updateConfig: vi.fn(),
  getSnapshotsForRun: vi.fn(),
  getSnapshotsBeforeRun: vi.fn(),
  getProjectById: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { BETTER_AUTH_URL: "https://seo.example.com" },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigById: mocks.getConfigById,
      updateConfig: mocks.updateConfig,
      getSnapshotsForRun: mocks.getSnapshotsForRun,
    },
  }),
);
vi.mock("@/server/features/rank-tracking/repositories/snapshotQueries", () => ({
  getSnapshotsBeforeRun: mocks.getSnapshotsBeforeRun,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectById: mocks.getProjectById },
}));

const RUN = { runId: "run_2", configId: "cfg_1", projectId: "proj_1" };

const snapshot = (keyword: string, position: number | null) => ({
  trackingKeywordId: `kw_${keyword}`,
  keyword,
  device: "desktop" as const,
  position,
  url: `https://example.com/${keyword}`,
});

describe("RankAlertService", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
    mocks.getConfigById.mockResolvedValue({
      id: "cfg_1",
      projectId: "proj_1",
      domain: "example.com",
      locationCode: 2840,
      locationName: null,
      alertWebhookUrl: "https://hooks.example.com/rank",
      alertPositionDrop: 5,
      alertLeftTop10: true,
      alertEnteredTop3: true,
    });
    mocks.getProjectById.mockResolvedValue({ name: "Example" });
    mocks.getSnapshotsBeforeRun.mockResolvedValue([
      snapshot("dropped", 4),
      snapshot("slipped", 9),
      snapshot("climbed", 6),
      snapshot("steady", 2),
    ]);
    mocks.getSnapshotsForRun.mockResolvedValue([
      snapshot("dropped", null),
      snapshot("slipped", 11),
      snapshot("climbed", 3),
      snapshot("steady", 2),
      snapshot("new", 1),
    ]);
  });

  it("posts one payload with every keyword that matched a rule", async () => {
    await RankAlertService.sendRunAlerts(RUN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://hooks.example.com/rank");
    const body = typeof init?.body === "string" ? init.body : "";
    const payload: unknown = JSON.parse(body);
    expect(payload).toMatchObject({
      dashboardUrl: "https://seo.example.com/p/proj_1/rank-tracking/cfg_1",
      changes: [
        { keyword: "dropped", rules: ["position_drop", "left_top_10"] },
        { keyword: "slipped", rules: ["left_top_10"] },
        { keyword: "climbed", rules: ["entered_top_3"] },
      ],
    });
  });

  it("retries a failed delivery only once", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    await RankAlertService.sendRunAlerts(RUN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects webhook URLs the crawler SSRF policy blocks", async () => {
    await expect(
      RankAlertService.updateAlerts("cfg_1", "proj_1", {
        webhookUrl: "http://169.254.169.254/latest",
      }),
    ).rejects.toThrow("public http(s) URL");
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
});
