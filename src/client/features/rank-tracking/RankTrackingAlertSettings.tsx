import { useId, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Bell, ChevronRight } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
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
  const webhookUrlId = useId();
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
    <Collapsible className="rounded-xl border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-sm font-medium">
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90"
          aria-hidden
        />
        <Bell className="size-4" aria-hidden />
        Webhook alerts
        <span className="font-normal text-muted-foreground">
          {config.alertWebhookUrl ? "On" : "Off"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form
          className="flex flex-col gap-3 border-t px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            After each scheduled check, OpenSEO posts one JSON payload with
            every keyword that matched a rule. Slack-compatible webhooks show
            the <code>text</code> summary.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={webhookUrlId}>Webhook URL</Label>
            <Input
              id={webhookUrlId}
              type="url"
              className="max-w-xl"
              placeholder="https://hooks.example.com/..."
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Must be a public http(s) URL. Leave empty to turn alerts off.
            </span>
          </div>
          <Label className="font-normal">
            <Checkbox
              checked={dropEnabled}
              onCheckedChange={(checked) => setDropEnabled(checked)}
            />
            Position drops by at least
            <Input
              type="number"
              min={1}
              max={100}
              className="h-7 w-16"
              value={positionDrop}
              disabled={!dropEnabled}
              onChange={(event) => setPositionDrop(Number(event.target.value))}
            />
            places
          </Label>
          <Label className="font-normal">
            <Checkbox
              checked={leftTop10}
              onCheckedChange={(checked) => setLeftTop10(checked)}
            />
            Falls out of the top 10
          </Label>
          <Label className="font-normal">
            <Checkbox
              checked={enteredTop3}
              onCheckedChange={(checked) => setEnteredTop3(checked)}
            />
            Enters the top 3
          </Label>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!isDirty}
              pending={saveMutation.isPending}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!config.alertWebhookUrl || isDirty}
              pending={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              Send test alert
            </Button>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
