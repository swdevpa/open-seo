import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { IndexNowService } from "./IndexNowService";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getAuditForProject: vi.fn(),
  getPagesForAudit: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditForProject: mocks.getAuditForProject,
    getPagesForAudit: mocks.getPagesForAudit,
  },
}));

const KEY = "abc123def456";

const postedBodySchema = z.object({
  host: z.string(),
  key: z.string(),
  keyLocation: z.string(),
  urlList: z.array(z.string()),
});

function postedBodies() {
  return mocks.fetch.mock.calls.map((call: unknown[]) => {
    const init = z.object({ body: z.string() }).parse(call[1]);
    return postedBodySchema.parse(JSON.parse(init.body));
  });
}

describe("IndexNowService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      domain: "acme.com",
      indexNowKey: KEY,
    });
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one IndexNow request per host and drops URLs outside the domain", async () => {
    const submission = await IndexNowService.submitUrls("org_1", "project_1", [
      "https://acme.com/a",
      "https://acme.com/a#section",
      "https://www.acme.com/b",
      "https://notacme.com/c",
    ]);

    expect(postedBodies()).toEqual([
      {
        host: "acme.com",
        key: KEY,
        keyLocation: `https://acme.com/${KEY}.txt`,
        urlList: ["https://acme.com/a"],
      },
      {
        host: "www.acme.com",
        key: KEY,
        keyLocation: `https://www.acme.com/${KEY}.txt`,
        urlList: ["https://www.acme.com/b"],
      },
    ]);
    expect(submission.rejectedUrls).toEqual(["https://notacme.com/c"]);
    expect(submission.submittedCount).toBe(2);
  });

  it("reports a rejected key without counting those URLs as submitted", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));

    const submission = await IndexNowService.submitUrls("org_1", "project_1", [
      "https://acme.com/a",
    ]);

    expect(submission.submittedCount).toBe(0);
    expect(submission.results[0]).toMatchObject({ ok: false, status: 403 });
  });

  it("submits only indexable, successfully fetched audit pages", async () => {
    mocks.getAuditForProject.mockResolvedValue({ id: "audit_1" });
    mocks.getPagesForAudit.mockResolvedValue([
      { url: "https://acme.com/ok", statusCode: 200, isIndexable: true },
      { url: "https://acme.com/noindex", statusCode: 200, isIndexable: false },
      { url: "https://acme.com/missing", statusCode: 404, isIndexable: true },
      {
        url: "https://acme.com/blocked",
        statusCode: 200,
        isIndexable: true,
        fetchClass: "blocked",
      },
    ]);

    await IndexNowService.submitAuditPages("org_1", "project_1", "audit_1");

    expect(postedBodies().map((body) => body.urlList)).toEqual([
      ["https://acme.com/ok"],
    ]);
  });

  it("follows a redirect to find the key file", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: `https://www.acme.com/${KEY}.txt` },
        }),
      )
      .mockResolvedValueOnce(new Response(`${KEY}\n`, { status: 200 }));

    const result = await IndexNowService.checkKeyFile("org_1", "project_1");

    expect(result).toMatchObject({
      ok: true,
      url: `https://www.acme.com/${KEY}.txt`,
    });
  });
});
