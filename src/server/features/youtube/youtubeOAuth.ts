import { symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  discoverYoutubeChannel,
  getGoogleUserInfoEmail,
} from "@/server/lib/youtubeClient";
import { AppError } from "@/server/lib/errors";
import { responseForAppError } from "@/server/lib/http-errors";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  getGoogleOAuthClientConfig,
  hasSelfHostedGoogleOAuthConfig,
} from "@/server/features/google/oauth-config";
import {
  YOUTUBE_OAUTH_PROVIDER_ID,
  YOUTUBE_OAUTH_SCOPES,
} from "@/shared/youtube";
import {
  getYoutubeGrantAccountId,
  YoutubeService,
} from "./services/YoutubeService";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALLBACK_PATH = "/api/youtube/oauth/callback" as const;

const stateSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  callbackPath: z.string().min(1),
  exp: z.number().int(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function stateKey(clientSecret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`openseo:youtube:${clientSecret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function safeCallbackPath(callbackURL: string, publicOrigin: string): string {
  try {
    const url = new URL(callbackURL, publicOrigin);
    if (url.origin !== publicOrigin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function signState(
  payload: string,
  clientSecret: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await stateKey(clientSecret),
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createState(input: {
  clientSecret: string;
  userId: string;
  organizationId: string;
  projectId: string;
  callbackURL: string;
  publicOrigin: string;
}): Promise<string> {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        userId: input.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        callbackPath: safeCallbackPath(input.callbackURL, input.publicOrigin),
        exp: Date.now() + 10 * 60 * 1_000,
      }),
    ),
  );
  return `${payload}.${await signState(payload, input.clientSecret)}`;
}

async function verifyState(state: string, clientSecret: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new AppError("VALIDATION_ERROR", "Invalid YouTube OAuth state.");
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await stateKey(clientSecret),
    base64UrlToBytes(signature),
    new TextEncoder().encode(payload),
  );
  if (!valid) {
    throw new AppError("VALIDATION_ERROR", "Invalid YouTube OAuth state.");
  }
  const parsed = stateSchema.parse(
    JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))),
  );
  if (parsed.exp < Date.now()) {
    throw new AppError("VALIDATION_ERROR", "Expired YouTube OAuth state.");
  }
  return parsed;
}

function redirectUri(publicOrigin: string): string {
  return `${publicOrigin}${CALLBACK_PATH}`;
}

export async function createYoutubeAuthorizationUrl(input: {
  userId: string;
  organizationId: string;
  projectId: string;
  callbackURL: string;
  publicOrigin: string;
}): Promise<string> {
  const config = await getGoogleOAuthClientConfig();
  if (!config || !(await hasSelfHostedGoogleOAuthConfig(config))) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "YouTube is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET.",
    );
  }
  const state = await createState({
    ...input,
    clientSecret: config.clientSecret,
  });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(input.publicOrigin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  publicOrigin: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: redirectUri(input.publicOrigin),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google rejected the YouTube authorization code.",
    );
  }
  return tokenResponseSchema.parse(await response.json());
}

function hasRequiredScopes(scope: string | undefined): boolean {
  const granted = new Set((scope ?? "").trim().split(/\s+/).filter(Boolean));
  return (
    granted.has("https://www.googleapis.com/auth/youtube.readonly") &&
    granted.has("https://www.googleapis.com/auth/yt-analytics.readonly")
  );
}

async function saveGoogleGrant(input: {
  userId: string;
  projectId: string;
  channelId: string;
  tokens: z.infer<typeof tokenResponseSchema>;
}): Promise<void> {
  const ctx = await getAuth().$context;
  const encrypt = (value: string) =>
    ctx.options.account?.encryptOAuthTokens
      ? symmetricEncrypt({ key: ctx.secretConfig, data: value })
      : value;
  const accountId = getYoutubeGrantAccountId(input.projectId, input.channelId);
  const existing = await db
    .select({ id: account.id, refreshToken: account.refreshToken })
    .from(account)
    .where(
      and(
        eq(account.userId, input.userId),
        eq(account.providerId, YOUTUBE_OAUTH_PROVIDER_ID),
        eq(account.accountId, accountId),
      ),
    )
    .limit(1);
  const values = {
    accountId,
    providerId: YOUTUBE_OAUTH_PROVIDER_ID,
    userId: input.userId,
    accessToken: await encrypt(input.tokens.access_token),
    refreshToken: input.tokens.refresh_token
      ? await encrypt(input.tokens.refresh_token)
      : (existing[0]?.refreshToken ?? null),
    idToken: input.tokens.id_token
      ? await encrypt(input.tokens.id_token)
      : null,
    accessTokenExpiresAt: new Date(
      Date.now() + (input.tokens.expires_in ?? 3600) * 1_000,
    ),
    refreshTokenExpiresAt: null,
    scope: input.tokens.scope
      ? input.tokens.scope.trim().split(/\s+/).join(",")
      : YOUTUBE_OAUTH_SCOPES.join(","),
    password: null,
  };
  if (existing[0]) {
    await db
      .update(account)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(account.id, existing[0].id));
    return;
  }
  await db.insert(account).values({
    id: crypto.randomUUID(),
    ...values,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function callbackResponse(
  callbackPath: string,
  publicOrigin: string,
  reason?: string,
): Response {
  const url = new URL(callbackPath, publicOrigin);
  url.searchParams.set("youtube", reason ? "error" : "connected");
  if (reason) url.searchParams.set("reason", reason);
  return new Response(null, {
    status: 303,
    headers: { Location: `${url.pathname}${url.search}${url.hash}` },
  });
}

export async function handleYoutubeOAuthCallbackRequest(
  request: Request,
): Promise<Response> {
  let callbackPath: string | null = null;
  const publicOrigin = getPublicOrigin(request);
  try {
    const config = await getGoogleOAuthClientConfig();
    if (!config)
      return new Response("Missing YouTube OAuth configuration", {
        status: 500,
      });
    const url = new URL(request.url);
    const stateParam = url.searchParams.get("state");
    if (!stateParam) {
      return new Response("Missing YouTube OAuth state", { status: 400 });
    }
    const state = await verifyState(stateParam, config.clientSecret);
    callbackPath = state.callbackPath;
    const context = await resolveUserContextFromHeaders(request.headers);
    if (
      state.userId !== context.userId ||
      state.organizationId !== context.organizationId
    ) {
      return new Response("YouTube OAuth user or workspace mismatch", {
        status: 403,
      });
    }
    const project = await ProjectRepository.getProjectForOrganization(
      state.projectId,
      context.organizationId,
    );
    if (!project)
      return callbackResponse(
        state.callbackPath,
        publicOrigin,
        "project_not_found",
      );
    if (url.searchParams.get("error")) {
      return callbackResponse(
        state.callbackPath,
        getPublicOrigin(request),
        "access_denied",
      );
    }
    const code = url.searchParams.get("code");
    if (!code) {
      return callbackResponse(
        state.callbackPath,
        getPublicOrigin(request),
        "missing_code",
      );
    }
    const tokens = await exchangeCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      publicOrigin,
    });
    if (!hasRequiredScopes(tokens.scope)) {
      return callbackResponse(
        state.callbackPath,
        publicOrigin,
        "required_scope_missing",
      );
    }
    const channel = await discoverYoutubeChannel(tokens.access_token);
    const connectedAccountEmail = await getGoogleUserInfoEmail(
      tokens.access_token,
    ).catch(() => null);
    await saveGoogleGrant({
      userId: context.userId,
      projectId: state.projectId,
      channelId: channel.channelId,
      tokens,
    });
    await YoutubeService.saveConnection({
      projectId: state.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      channel,
      connectedAccountEmail,
    });
    return callbackResponse(state.callbackPath, publicOrigin);
  } catch (error) {
    if (callbackPath) {
      return callbackResponse(callbackPath, publicOrigin, "provider_error");
    }
    return responseForAppError(error, "YouTube OAuth failed");
  }
}
