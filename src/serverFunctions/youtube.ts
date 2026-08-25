import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { YoutubeService } from "@/server/features/youtube/services/YoutubeService";
import { createYoutubeAuthorizationUrl } from "@/server/features/youtube/youtubeOAuth";
import { hasSelfHostedGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const dateRangeSchema = projectScopedSchema.extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
const detailSchema = dateRangeSchema.extend({
  channelId: z.string().min(1),
});
const startLinkSchema = projectScopedSchema.extend({
  callbackURL: z.string().min(1),
});
const disconnectSchema = projectScopedSchema.extend({
  channelId: z.string().min(1),
});

export const getYoutubeOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(dateRangeSchema)
  .handler(async ({ data, context }) => {
    const [overview, hosted, configured] = await Promise.all([
      YoutubeService.getOverview({
        projectId: context.projectId,
        startDate: data.startDate,
        endDate: data.endDate,
      }),
      isHostedServerAuthMode(),
      hasSelfHostedGoogleOAuthConfig(),
    ]);
    return {
      ...overview,
      googleOAuthConfigured: hosted || configured,
    };
  });

export const getYoutubeChannelDetail = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(detailSchema)
  .handler(({ data, context }) =>
    YoutubeService.getChannelDetail({
      projectId: context.projectId,
      channelId: data.channelId,
      startDate: data.startDate,
      endDate: data.endDate,
    }),
  );

export const disconnectYoutubeChannel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(disconnectSchema)
  .handler(async ({ data, context }) => {
    await YoutubeService.disconnect({
      projectId: context.projectId,
      channelId: data.channelId,
      userId: context.userId,
    });
    return { disconnected: true as const };
  });

export const startYoutubeLink = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(startLinkSchema)
  .handler(async ({ data, context }) => {
    // Project authorization is repeated here because this function also needs
    // to bind the signed OAuth state to the exact project.
    const url = await createYoutubeAuthorizationUrl({
      userId: context.userId,
      organizationId: context.organizationId,
      projectId: data.projectId,
      callbackURL: data.callbackURL,
      publicOrigin: getPublicOrigin(getRequest()),
    });
    return { url };
  });
