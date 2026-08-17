import { createServerFn } from "@tanstack/react-start";
import { ContentOptimizationService } from "@/server/features/content-optimization/services/ContentOptimizationService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { resolveMarket } from "@/shared/keyword-locations";
import { z } from "zod";

const projectIdSchema = z.object({
  projectId: z.string().min(1),
});

const scanInputSchema = projectIdSchema.extend({
  url: z.string().url().max(2048),
  keyword: z.string().trim().min(1).max(150),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().trim().min(2).max(8).optional(),
});

const scanIdSchema = projectIdSchema.extend({
  scanId: z.string().min(1),
});

export const runContentOptimization = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanInputSchema)
  .handler(async ({ data, context }) => {
    const market = resolveMarket(data, context.project);
    return ContentOptimizationService.run(
      {
        projectId: context.projectId,
        url: data.url,
        keyword: data.keyword,
        ...market,
      },
      context,
    );
  });

export const listContentOptimizations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectIdSchema)
  .handler(({ context }) => ContentOptimizationService.list(context.projectId));

export const getContentOptimization = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanIdSchema)
  .handler(({ data, context }) =>
    ContentOptimizationService.get(context.projectId, data.scanId),
  );

export const deleteContentOptimization = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(scanIdSchema)
  .handler(({ data, context }) =>
    ContentOptimizationService.remove(context.projectId, data.scanId),
  );
