import { z } from "zod";
import { RankAlertService } from "@/server/features/rank-tracking/services/RankAlertService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { rankAlertSettingsSchema } from "@/shared/rank-tracking";

const fields = rankAlertSettingsSchema.shape;

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .describe("Rank tracker ID from get_rank_tracker."),
  webhookUrl: fields.webhookUrl
    .optional()
    .describe(
      "Public http(s) URL that receives one JSON POST per scheduled run with triggered changes. null turns alerts off.",
    ),
  positionDrop: fields.positionDrop
    .optional()
    .describe(
      "Alert when a keyword drops at least this many places (suggested 5). null disables the rule.",
    ),
  leftTop10: fields.leftTop10
    .optional()
    .describe("Alert when a keyword falls out of the top 10."),
  enteredTop3: fields.enteredTop3
    .optional()
    .describe("Alert when a keyword enters the top 3."),
  sendTest: z
    .boolean()
    .optional()
    .describe("After saving, POST a sample payload to the webhook."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const setRankTrackerAlertsTool = {
  name: "set_rank_tracker_alerts",
  config: {
    title: "Set rank tracker alerts",
    description:
      "Configure webhook alerts for a rank tracker. After each scheduled check, OpenSEO compares every keyword with its previous position and POSTs one JSON payload (project, tracker, keyword, device, old/new position, URL, dashboard link, plus a Slack-compatible `text` summary) when a rule matches: position drop of at least N places, fell out of the top 10, or entered the top 3. Omitted fields keep their current value; current settings are also in get_rank_tracker's config. Uses no credits.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        settings: rankAlertSettingsSchema,
        test: z
          .object({
            ok: z.boolean(),
            status: z.number().nullable(),
            message: z.string(),
          })
          .optional(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const settings = await RankAlertService.updateAlerts(
      args.trackerId,
      args.projectId,
      {
        webhookUrl: args.webhookUrl,
        positionDrop: args.positionDrop,
        leftTop10: args.leftTop10,
        enteredTop3: args.enteredTop3,
      },
    );
    const test =
      args.sendTest && settings.webhookUrl
        ? await RankAlertService.sendTestAlert(args.trackerId, args.projectId)
        : undefined;

    const rules = [
      settings.positionDrop !== null
        ? `drop of ${settings.positionDrop}+ places`
        : null,
      settings.leftTop10 ? "fell out of top 10" : null,
      settings.enteredTop3 ? "entered top 3" : null,
    ].filter((rule) => rule !== null);
    const lines = [
      settings.webhookUrl
        ? `Alerts for tracker ${args.trackerId} post to ${settings.webhookUrl} on: ${rules.length > 0 ? rules.join(", ") : "no rules enabled"}.`
        : `Alerts are off for tracker ${args.trackerId} (no webhook URL).`,
      test ? `Test alert: ${test.message}` : null,
    ].filter((line) => line !== null);

    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: { trackerId: args.trackerId, settings, test },
    });
  }),
};
