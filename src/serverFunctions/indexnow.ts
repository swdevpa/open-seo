import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  indexNowProjectSchema,
  submitIndexNowUrlsSchema,
} from "@/types/schemas/indexnow";

const submitAuditToIndexNowSchema = indexNowProjectSchema.extend({
  auditId: z.string().min(1),
});

export const getIndexNowSetup = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.getSetup(context));

export const checkIndexNowKeyFiles = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.checkKeyFiles(context));

export const setUpIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(indexNowProjectSchema)
  .handler(async ({ context }) => IndexNowService.setUp(context));

export const submitIndexNowUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitIndexNowUrlsSchema)
  .handler(async ({ data, context }) =>
    IndexNowService.submitUrls(context, data.urls),
  );

export const submitAuditToIndexNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(submitAuditToIndexNowSchema)
  .handler(async ({ data, context }) =>
    IndexNowService.submitAuditPages(context, data.auditId),
  );
