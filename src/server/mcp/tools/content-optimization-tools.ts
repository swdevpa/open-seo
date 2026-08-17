import { z } from "zod";
import { ContentOptimizationService } from "@/server/features/content-optimization/services/ContentOptimizationService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import { resolveMarket } from "@/shared/keyword-locations";
import { contentOptimizationReportSchema } from "@/shared/content-optimization";

const runInputSchema = {
  projectId: projectIdSchema,
  url: z.string().url().max(2048).describe("Page URL to analyze."),
  keyword: z.string().trim().min(1).max(150).describe("Target search keyword."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type RunArgs = z.infer<z.ZodObject<typeof runInputSchema>>;

const scanOutputSchema = z
  .object({
    scanId: z.string(),
    status: z.literal("completed"),
    report: contentOptimizationReportSchema,
    ...optionalMetaOutputSchema,
  })
  .passthrough();

export const runContentOptimizationTool = {
  name: "run_content_optimization",
  config: {
    title: "Run content optimization",
    description:
      "Run a DataForSEO content optimization scan. Compare a page with the top organic Google pages for one keyword. Returns structure benchmarks, entity and keyword variation coverage, page classification, topical authority questions, title and topic suggestions, internal link opportunities, competitor terms, and practical actions. Uses one SERP request plus page parsing requests and consumes DataForSEO credits.",
    inputSchema: runInputSchema,
    outputSchema: scanOutputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RunArgs, context) => {
    const market = resolveMarket(args, context.project);
    const result = await ContentOptimizationService.run(
      {
        projectId: args.projectId,
        url: args.url,
        keyword: args.keyword,
        ...market,
      },
      context.billing,
    );
    return mcpResponse({
      text: `${result.report.summary} The report includes ${result.report.entityCoverage.naturalLanguageEntities.length} entity candidates, ${result.report.entityCoverage.keywordVariations.length} keyword variations, ${result.report.terms.length} related terms, and ${result.report.competitors.length} competitor pages.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/content-optimization?scanId=${encodeURIComponent(result.id)}`,
      ),
      structuredContent: {
        scanId: result.id,
        status: result.status,
        report: result.report,
      },
    });
  }),
};

const getInputSchema = {
  projectId: projectIdSchema,
  scanId: z.string().min(1).describe("Stored content scan ID."),
} as const;

type GetArgs = z.infer<z.ZodObject<typeof getInputSchema>>;

export const getContentOptimizationTool = {
  name: "get_content_optimization",
  config: {
    title: "Get content optimization report",
    description:
      "Read a stored content optimization report for this project. Free; does not call DataForSEO.",
    inputSchema: getInputSchema,
    outputSchema: scanOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetArgs, context) => {
    const result = await ContentOptimizationService.get(
      args.projectId,
      args.scanId,
    );
    return mcpResponse({
      text: `${result.report.summary} The report includes ${result.report.entityCoverage.naturalLanguageEntities.length} entity candidates, ${result.report.entityCoverage.keywordVariations.length} keyword variations, ${result.report.terms.length} related terms, and ${result.report.competitors.length} competitor pages.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/content-optimization?scanId=${encodeURIComponent(result.id)}`,
      ),
      structuredContent: {
        scanId: result.id,
        status: result.status,
        report: result.report,
      },
    });
  }),
};
