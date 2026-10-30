import { z } from "zod";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const enableIndexNowTool = {
  name: "enable_indexnow",
  config: {
    title: "Enable IndexNow",
    description:
      "Enables IndexNow for a project and returns its key. Uses no credits. Idempotent: if IndexNow is already enabled, returns the existing key without changing it. Requires the project's website. To finish setup, publish a plain-text file named keyFileName at the site root (its content is exactly the key) so it is served at keyFileUrl, then call submit_indexnow_urls.",
    inputSchema,
    outputSchema: z.looseObject({
      key: z.string(),
      keyCreated: z.boolean(),
      keyFileName: z.string(),
      keyFileUrl: z.string(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const { domain, key, created } = await IndexNowService.setUp({
      projectId: args.projectId,
      organizationId: context.auth.organizationId,
    });
    const keyFileName = `${key}.txt`;
    const keyFileUrl = `https://${domain}/${keyFileName}`;

    return mcpResponse({
      text: [
        `IndexNow is enabled for ${domain}.`,
        `Key: ${key}`,
        `Publish a file named ${keyFileName} containing only the key so it is served at ${keyFileUrl}.`,
      ].join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/settings/integrations#indexnow`,
      ),
      structuredContent: { key, keyCreated: created, keyFileName, keyFileUrl },
    });
  }),
};
