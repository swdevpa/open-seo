import { beforeEach, describe, expect, it, vi } from "vitest";
import { enableIndexNowTool } from "./enable-indexnow";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  setUp: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: async () => ({ id: "project_123" }),
  },
}));

vi.mock("@/server/features/indexnow/services/IndexNowService", () => ({
  IndexNowService: { setUp: mocks.setUp },
}));

const toolContext = makeToolContext();

describe("enable_indexnow MCP tool", () => {
  beforeEach(() => {
    mocks.setUp.mockResolvedValue({
      domain: "acme.com",
      key: "abc123",
      created: true,
    });
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
});
