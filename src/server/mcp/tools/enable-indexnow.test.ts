import { beforeEach, describe, expect, it, vi } from "vitest";
import { enableIndexNowTool } from "./enable-indexnow";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  enableKey: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/indexnow/services/IndexNowService", () => ({
  IndexNowService: { enableKey: mocks.enableKey },
}));

const toolContext = makeToolContext();

describe("enable_indexnow MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_123",
      domain: "acme.com",
    });
    mocks.enableKey.mockResolvedValue("abc123");
  });

  it("returns the key and where the key file must be served", async () => {
    const result = await enableIndexNowTool.handler(
      { projectId: "project_123" },
      toolContext,
    );

    expect(result.structuredContent).toMatchObject({
      key: "abc123",
      keyFileName: "abc123.txt",
      keyFileUrl: "https://acme.com/abc123.txt",
    });
  });

  it("refuses to enable IndexNow for a project without a domain", async () => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_123",
      domain: null,
    });

    await expect(
      enableIndexNowTool.handler({ projectId: "project_123" }, toolContext),
    ).rejects.toThrow("Set a project domain");
    expect(mocks.enableKey).not.toHaveBeenCalled();
  });
});
