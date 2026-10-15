import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  sendRankTrackingTestAlert,
  updateRankTrackingAlerts,
} from "@/serverFunctions/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  RANK_ALERT_DEFAULT_POSITION_DROP,
  rankAlertSettingsSchema,
} from "@/shared/rank-tracking";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";

export function RankTrackingAlertSettings({
  config,
  projectId,
  onSaved,
}: {
  config: RankTrackingConfig;
  projectId: string;
  onSaved: () => void;
}) {
  const [webhookUrl, setWebhookUrl] = useState(config.alertWebhookUrl ?? "");
  const [dropEnabled, setDropEnabled] = useState(
    config.alertPositionDrop !== null,
  );
  const [positionDrop, setPositionDrop] = useState(
    config.alertPositionDrop ?? RANK_ALERT_DEFAULT_POSITION_DROP,
  );
  const [leftTop10, setLeftTop10] = useState(config.alertLeftTop10);
  const [enteredTop3, setEnteredTop3] = useState(config.alertEnteredTop3);

  const isDirty =
    webhookUrl.trim() !== (config.alertWebhookUrl ?? "") ||
    (dropEnabled ? positionDrop : null) !== config.alertPositionDrop ||
    leftTop10 !== config.alertLeftTop10 ||
    enteredTop3 !== config.alertEnteredTop3;

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings = rankAlertSettingsSchema.parse({
        webhookUrl: webhookUrl.trim() || null,
        positionDrop: dropEnabled ? positionDrop : null,
        leftTop10,
        enteredTop3,
      });
      return updateRankTrackingAlerts({
        data: { projectId, configId: config.id, ...settings },
      });
    },
    onSuccess: () => {
      toast.success("Alert settings saved");
      onSaved();
    },
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(error, "Failed to save alert settings"),
      );
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      sendRankTrackingTestAlert({
        data: { projectId, configId: config.id },
      }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Test alert delivered");
      else toast.error(`Test alert failed: ${result.message}`);
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to send test alert"));
    },
  });

  return (
    <details className="collapse collapse-arrow border border-base-300 bg-base-100">
      <summary className="collapse-title flex items-center gap-2 text-sm font-medium">
        <Bell className="size-4" />
        Webhook alerts
        <span className="text-base-content/60 font-normal">
          {config.alertWebhookUrl ? "On" : "Off"}
        </span>
      </summary>
      <form
        className="collapse-content flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <p className="text-sm text-base-content/70">
          After each scheduled check, OpenSEO posts one JSON payload with every
          keyword that matched a rule. Slack-compatible webhooks show the{" "}
          <code>text</code> summary.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Webhook URL
          <input
            type="url"
            className="input input-bordered input-sm w-full max-w-xl"
            placeholder="https://hooks.example.com/..."
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
          <span className="text-xs text-base-content/60">
            Must be a public http(s) URL. Leave empty to turn alerts off.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={dropEnabled}
            onChange={(event) => setDropEnabled(event.target.checked)}
          />
          Position drops by at least
          <input
            type="number"
            min={1}
            max={100}
            className="input input-bordered input-xs w-16"
            value={positionDrop}
            disabled={!dropEnabled}
            onChange={(event) => setPositionDrop(Number(event.target.value))}
          />
          places
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={leftTop10}
            onChange={(event) => setLeftTop10(event.target.checked)}
          />
          Falls out of the top 10
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={enteredTop3}
            onChange={(event) => setEnteredTop3(event.target.checked)}
          />
          Enters the top 3
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!isDirty || saveMutation.isPending}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={
              !config.alertWebhookUrl || isDirty || testMutation.isPending
            }
            onClick={() => testMutation.mutate()}
          >
            Send test alert
          </button>
        </div>
      </form>
    </details>
  );
}
