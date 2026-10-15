import { env } from "cloudflare:workers";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getSnapshotsBeforeRun } from "@/server/features/rank-tracking/repositories/snapshotQueries";
import { isCrawlableUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_CHANGES_PER_PAYLOAD = 200;

type AlertRule = "position_drop" | "left_top_10" | "entered_top_3";

type Snapshot = {
  trackingKeywordId: string;
  keyword: string;
  device: "desktop" | "mobile";
  position: number | null;
  url: string | null;
};

type RankAlertChange = {
  keyword: string;
  device: "desktop" | "mobile";
  previousPosition: number | null;
  currentPosition: number | null;
  url: string | null;
  rules: AlertRule[];
};

type AlertSettings = {
  webhookUrl: string | null;
  positionDrop: number | null;
  leftTop10: boolean;
  enteredTop3: boolean;
};

// null position = not found within the SERP depth, so it ranks below anything.
function rankOf(position: number | null): number {
  return position ?? Number.POSITIVE_INFINITY;
}

function triggeredRules(
  config: RankTrackingConfig,
  previous: number | null,
  current: number | null,
): AlertRule[] {
  const rules: AlertRule[] = [];
  if (
    config.alertPositionDrop !== null &&
    previous !== null &&
    rankOf(current) - previous >= config.alertPositionDrop
  ) {
    rules.push("position_drop");
  }
  if (config.alertLeftTop10 && previous !== null && previous <= 10) {
    if (rankOf(current) > 10) rules.push("left_top_10");
  }
  if (config.alertEnteredTop3 && current !== null && current <= 3) {
    if (rankOf(previous) > 3) rules.push("entered_top_3");
  }
  return rules;
}

function dashboardUrl(projectId: string, configId: string): string {
  const path = `/p/${projectId}/rank-tracking/${configId}`;
  const base = env.BETTER_AUTH_URL?.trim();
  return base ? new URL(path, base).toString() : path;
}

function buildPayload(input: {
  config: RankTrackingConfig;
  projectName: string;
  runId: string | null;
  changes: RankAlertChange[];
  test?: boolean;
}) {
  const { config, changes } = input;
  const tracker = config.locationName
    ? `${config.domain} (${config.locationName})`
    : config.domain;
  const link = dashboardUrl(config.projectId, config.id);
  const lines = changes
    .slice(0, 10)
    .map(
      (change) =>
        `• ${change.keyword} (${change.device}): ${change.previousPosition ?? "not ranking"} → ${change.currentPosition ?? "not ranking"}`,
    );
  return {
    event: input.test ? "rank_tracking.test" : "rank_tracking.alert",
    // Plain-text summary so Slack-compatible incoming webhooks render it.
    text: [
      `${input.test ? "[Test] " : ""}OpenSEO rank alert for ${tracker} in ${input.projectName}: ${changes.length} change(s).`,
      ...lines,
      link,
    ].join("\n"),
    project: { id: config.projectId, name: input.projectName },
    tracker: {
      id: config.id,
      domain: config.domain,
      locationCode: config.locationCode,
      locationName: config.locationName,
    },
    runId: input.runId,
    dashboardUrl: link,
    changes: changes.slice(0, MAX_CHANGES_PER_PAYLOAD),
  };
}

/** POST once, retrying a single time on a network error, 429, or 5xx.
 *  Redirects are not followed so a 3xx can't bounce the request past the
 *  SSRF check. */
async function postWebhook(url: string, payload: unknown) {
  if (!isCrawlableUrl(url)) {
    return { ok: false, status: null, message: "Webhook URL is not allowed." };
  }
  let lastMessage = "";
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "OpenSEO-Alerts/1.0",
        },
        body: JSON.stringify(payload),
        redirect: "manual",
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (response.ok) {
        return { ok: true, status: response.status, message: "Delivered." };
      }
      lastStatus = response.status;
      lastMessage = `Webhook responded with HTTP ${response.status}.`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastStatus = null;
      lastMessage = error instanceof Error ? error.message : String(error);
    }
  }
  return { ok: false, status: lastStatus, message: lastMessage };
}

async function requireConfig(configId: string, projectId: string) {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("NOT_FOUND", "Rank tracker not found in this project.");
  }
  return config;
}

/** Apply alert settings; omitted fields keep their stored value. */
async function updateAlerts(
  configId: string,
  projectId: string,
  settings: Partial<AlertSettings>,
): Promise<AlertSettings> {
  const config = await requireConfig(configId, projectId);
  const webhookUrl =
    settings.webhookUrl === undefined
      ? config.alertWebhookUrl
      : settings.webhookUrl?.trim() || null;
  if (webhookUrl && !isCrawlableUrl(webhookUrl)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Webhook URL must be a public http(s) URL.",
    );
  }
  const next: AlertSettings = {
    webhookUrl,
    positionDrop:
      settings.positionDrop === undefined
        ? config.alertPositionDrop
        : settings.positionDrop,
    leftTop10: settings.leftTop10 ?? config.alertLeftTop10,
    enteredTop3: settings.enteredTop3 ?? config.alertEnteredTop3,
  };
  await RankTrackingRepository.updateConfig(configId, projectId, {
    alertWebhookUrl: next.webhookUrl,
    alertPositionDrop: next.positionDrop,
    alertLeftTop10: next.leftTop10,
    alertEnteredTop3: next.enteredTop3,
  });
  return next;
}

async function sendTestAlert(configId: string, projectId: string) {
  const config = await requireConfig(configId, projectId);
  if (!config.alertWebhookUrl) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Save a webhook URL before sending a test alert.",
    );
  }
  const project = await ProjectRepository.getProjectById(projectId);
  const payload = buildPayload({
    config,
    projectName: project?.name ?? projectId,
    runId: null,
    test: true,
    changes: [
      {
        keyword: "example keyword",
        device: "desktop",
        previousPosition: 4,
        currentPosition: 12,
        url: `https://${config.domain}/`,
        rules: ["position_drop", "left_top_10"],
      },
    ],
  });
  return postWebhook(config.alertWebhookUrl, payload);
}

/** Compare a finished run with each keyword's previous snapshot and POST one
 *  payload with every triggered change. Never throws: alert delivery must not
 *  fail the rank check it follows. */
async function sendRunAlerts(input: {
  runId: string;
  configId: string;
  projectId: string;
}) {
  try {
    const config = await requireConfig(input.configId, input.projectId);
    if (!config.alertWebhookUrl) return;

    const [current, previous] = await Promise.all([
      RankTrackingRepository.getSnapshotsForRun(input.runId),
      getSnapshotsBeforeRun(input.configId, input.runId),
    ]);
    const previousByKey = new Map<string, Snapshot>(
      previous.map((snapshot) => [
        `${snapshot.trackingKeywordId}:${snapshot.device}`,
        snapshot,
      ]),
    );
    const changes: RankAlertChange[] = [];
    for (const snapshot of current) {
      const before = previousByKey.get(
        `${snapshot.trackingKeywordId}:${snapshot.device}`,
      );
      if (!before) continue;
      const rules = triggeredRules(config, before.position, snapshot.position);
      if (rules.length === 0) continue;
      changes.push({
        keyword: snapshot.keyword,
        device: snapshot.device,
        previousPosition: before.position,
        currentPosition: snapshot.position,
        url: snapshot.url ?? before.url,
        rules,
      });
    }
    if (changes.length === 0) return;

    const project = await ProjectRepository.getProjectById(input.projectId);
    const result = await postWebhook(
      config.alertWebhookUrl,
      buildPayload({
        config,
        projectName: project?.name ?? input.projectId,
        runId: input.runId,
        changes,
      }),
    );
    if (!result.ok) {
      console.warn(
        `[rank-alerts] ${input.runId} webhook delivery failed: ${result.message}`,
      );
    }
  } catch (error) {
    console.error(
      `[rank-alerts] ${input.runId} alert evaluation failed`,
      error,
    );
  }
}

export const RankAlertService = { updateAlerts, sendTestAlert, sendRunAlerts };
