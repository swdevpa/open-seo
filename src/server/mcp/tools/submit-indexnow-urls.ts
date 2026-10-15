import { z } from "zod";
import {
  INDEXNOW_MAX_URLS,
  IndexNowService,
} from "@/server/features/indexnow/services/IndexNowService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  urls: z
    .array(z.string().min(1).max(2048))
    .min(1)
    .max(INDEXNOW_MAX_URLS)
    .describe(
      "Absolute URLs on the project's domain or its subdomains to submit (1-10,000).",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const submitIndexNowUrlsTool = {
  name: "submit_indexnow_urls",
  config: {
    title: "Submit URLs to IndexNow",
    description:
      "Notify IndexNow search engines (Bing, Yandex, Seznam, Naver, and others) that pages were added, updated, or deleted, so they recrawl them quickly. Uses no credits. Requires a project domain and IndexNow enabled in project settings with the key file published on the site. URLs outside the project's domain are skipped and listed in rejectedUrls. Each result reports the host's HTTP status: 200 and 202 mean accepted, 403 and 422 usually mean the key file is missing or wrong. Ask the user before submitting large batches.",
    inputSchema,
    outputSchema: {
      submittedCount: z.number(),
      rejectedUrls: z.array(z.string()),
      results: z.array(
        z.object({
          host: z.string(),
          urlCount: z.number(),
          ok: z.boolean(),
          status: z.number().nullable(),
          message: z.string(),
        }),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const submission = await IndexNowService.submitUrls(
      context.auth.organizationId,
      args.projectId,
      args.urls,
    );

    const lines = [
      `Submitted ${submission.submittedCount} of ${args.urls.length} URL(s) to IndexNow.`,
      ...submission.results.map(
        (result) =>
          `${result.host}: ${result.urlCount} URL(s), ${result.status ?? "no response"}, ${result.message}`,
      ),
      ...(submission.rejectedUrls.length > 0
        ? [
            `Skipped ${submission.rejectedUrls.length} URL(s) outside the project domain.`,
          ]
        : []),
    ];

    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/settings`,
      ),
      structuredContent: submission,
    });
  }),
};
