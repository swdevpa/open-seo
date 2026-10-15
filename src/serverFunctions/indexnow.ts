import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  INDEXNOW_MAX_URLS,
  IndexNowService,
} from "@/server/features/indexnow/services/IndexNowService";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

const submitUrlsSchema = projectScopedSchema.extend({
  urls: z.array(z.string().min(1).max(2048)).min(1).max(INDEXNOW_MAX_URLS),
});

const submitAuditSchema = projectScopedSchema.extend({
  auditId: z.string().min(1),
});

export const enableIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) =>
    IndexNowService.enableKey(context.organizationId, context.projectId),
  );

export const regenerateIndexNowKey = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) =>
    IndexNowService.regenerateKey(context.organizationId, context.projectId),
  );

export const checkIndexNowKeyFile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) =>
    IndexNowService.checkKeyFile(context.organizationId, context.projectId),
  );

export const submitIndexNowUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitUrlsSchema)
  .handler(({ data, context }) =>
    IndexNowService.submitUrls(
      context.organizationId,
      context.projectId,
      data.urls,
    ),
  );

export const submitAuditToIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitAuditSchema)
  .handler(({ data, context }) =>
    IndexNowService.submitAuditPages(
      context.organizationId,
      context.projectId,
      data.auditId,
    ),
  );
