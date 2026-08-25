import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createYoutubeAuthorizationUrl,
  handleYoutubeOAuthCallbackRequest,
} from "./youtubeOAuth";
import { getYoutubeGrantAccountId } from "./services/YoutubeService";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClientConfig: vi.fn(),
  hasSelfHostedGoogleOAuthConfig: vi.fn(),
  getAuth: vi.fn(),
  resolveUserContextFromHeaders: vi.fn(),
  getProjectForOrganization: vi.fn(),
  discoverYoutubeChannel: vi.fn(),
  getGoogleUserInfoEmail: vi.fn(),
  saveConnection: vi.fn(),
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  account: {
    id: "id",
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
    refreshToken: "refreshToken",
  },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.selectLimit }) }),
    }),
    insert: () => ({ values: mocks.insertValues }),
  },
}));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolveUserContextFromHeaders,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/lib/youtubeClient", () => ({
  discoverYoutubeChannel: mocks.discoverYoutubeChannel,
  getGoogleUserInfoEmail: mocks.getGoogleUserInfoEmail,
}));
vi.mock("@/server/features/google/oauth-config", () => ({
  getGoogleOAuthClientConfig: mocks.getGoogleOAuthClientConfig,
  hasSelfHostedGoogleOAuthConfig: mocks.hasSelfHostedGoogleOAuthConfig,
}));
vi.mock("./repositories/YoutubeConnectionRepository", () => ({
  YoutubeConnectionRepository: { upsert: mocks.saveConnection },
}));

const oauthInput = {
  userId: "user-1",
  organizationId: "org-1",
  projectId: "project-1",
  callbackURL: "https://app.example/p/project-1/youtube",
  publicOrigin: "https://app.example",
};

describe("YouTube OAuth", () => {
  beforeEach(() => {
    mocks.getGoogleOAuthClientConfig.mockResolvedValue({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(true);
    mocks.selectLimit.mockResolvedValue([]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.getAuth.mockReturnValue({
      $context: Promise.resolve({
        options: { account: { encryptOAuthTokens: false } },
        secretConfig: "secret",
      }),
    });
    mocks.resolveUserContextFromHeaders.mockResolvedValue({
      userId: "user-1",
      userEmail: "user@example.com",
      organizationId: "org-1",
    });
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project-1" });
    mocks.getGoogleUserInfoEmail.mockResolvedValue("google@example.com");
    mocks.saveConnection.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
        }),
      ),
    );
  });

  it("signs the user, workspace, project, and return path into state", async () => {
    const url = new URL(await createYoutubeAuthorizationUrl(oauthInput));
    const state = url.searchParams.get("state");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/youtube/oauth/callback",
    );
    expect(url.searchParams.get("scope")).toContain("yt-analytics.readonly");
    expect(state).toBeTruthy();
    if (!state) throw new Error("Expected signed OAuth state");
    const payload = state.split(".")[0];
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            `${payload}${"=".repeat((4 - (payload.length % 4)) % 4)}`
              .replaceAll("-", "+")
              .replaceAll("_", "/"),
          ),
          (character) => character.charCodeAt(0),
        ),
      ),
    ) as unknown;
    expect(decoded).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      callbackPath: "/p/project-1/youtube",
    });
  });

  it("stores separate project and channel grant keys", () => {
    expect(getYoutubeGrantAccountId("project-1", "channel-a")).not.toBe(
      getYoutubeGrantAccountId("project-1", "channel-b"),
    );
    expect(getYoutubeGrantAccountId("project-1", "channel-a")).not.toBe(
      getYoutubeGrantAccountId("project-2", "channel-a"),
    );
  });

  it("does not persist a row when the required Analytics scope is missing", async () => {
    const authorizationUrl = new URL(
      await createYoutubeAuthorizationUrl(oauthInput),
    );
    const request = new Request(
      `https://app.example/api/youtube/oauth/callback?state=${encodeURIComponent(authorizationUrl.searchParams.get("state")!)}&code=code`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: "access-token",
          scope: "https://www.googleapis.com/auth/youtube.readonly",
        }),
      ),
    );
    const response = await handleYoutubeOAuthCallbackRequest(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toContain("youtube=error");
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.saveConnection).not.toHaveBeenCalled();
  });
});
