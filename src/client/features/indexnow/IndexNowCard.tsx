import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyButton } from "@/client/features/ai-mcp/SetupControls";
import { showIndexNowSubmissionToast } from "@/client/features/indexnow/submissionToast";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import type { ProjectSummary } from "@/client/features/projects/types";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  checkIndexNowKeyFile,
  enableIndexNow,
  regenerateIndexNowKey,
  submitIndexNowUrls,
} from "@/serverFunctions/indexnow";

export function IndexNowCard({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const refreshProjects = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });

  const enableMutation = useMutation({
    mutationFn: () => enableIndexNow({ data: { projectId: project.id } }),
    onSuccess: refreshProjects,
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to enable IndexNow")),
  });

  const key = project.indexNowKey;
  const status = key ? "connected" : "disconnected";

  return (
    <IntegrationConnectionCard title="IndexNow" status={status}>
      {!project.domain ? (
        <p className="text-sm text-base-content/70">
          Add a project domain above to use IndexNow.
        </p>
      ) : !key ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-base-content/70">
            Tell Bing, Yandex, and other IndexNow search engines about new or
            updated pages right away instead of waiting for a recrawl.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm shrink-0"
            onClick={() => enableMutation.mutate()}
            disabled={enableMutation.isPending}
          >
            Enable IndexNow
          </button>
        </div>
      ) : (
        <IndexNowSetup
          projectId={project.id}
          domain={project.domain}
          indexNowKey={key}
          onKeyChanged={refreshProjects}
        />
      )}
    </IntegrationConnectionCard>
  );
}

function IndexNowSetup({
  projectId,
  domain,
  indexNowKey,
  onKeyChanged,
}: {
  projectId: string;
  domain: string;
  indexNowKey: string;
  onKeyChanged: () => Promise<void>;
}) {
  const [urlsText, setUrlsText] = React.useState("");
  const keyFileUrl = `https://${domain}/${indexNowKey}.txt`;

  const checkMutation = useMutation({
    mutationFn: () => checkIndexNowKeyFile({ data: { projectId } }),
    onSuccess: (result) =>
      result.ok
        ? toast.success(`Key file found at ${result.url}`)
        : toast.error(`${result.message} (${result.url})`),
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to check key file")),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateIndexNowKey({ data: { projectId } }),
    onSuccess: async () => {
      await onKeyChanged();
      toast.success("New key created. Replace the key file on your site.");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to regenerate key")),
  });

  const urls = urlsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const submitMutation = useMutation({
    mutationFn: () => submitIndexNowUrls({ data: { projectId, urls } }),
    onSuccess: (submission) => {
      showIndexNowSubmissionToast(submission);
      if (submission.results.every((result) => result.ok)) setUrlsText("");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to submit URLs")),
  });

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <p className="text-base-content/70">
          Publish a text file named{" "}
          <code className="font-mono">{indexNowKey}.txt</code> at the root of
          your site that contains only the key. If pages live on a subdomain
          such as www, the file must be reachable there too.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">
            {indexNowKey}
          </code>
          <CopyButton
            value={indexNowKey}
            successMessage="Key copied"
            iconOnly
          />
        </div>
        <p className="truncate text-xs text-base-content/50">
          Expected at {keyFileUrl}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
          >
            Check key file
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (
                window.confirm(
                  "Create a new key? The current key file on your site stops working until you replace it.",
                )
              ) {
                regenerateMutation.mutate();
              }
            }}
            disabled={regenerateMutation.isPending}
          >
            Regenerate key
          </button>
        </div>
      </div>

      <form
        className="space-y-2 border-t border-base-300 pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (urls.length > 0 && !submitMutation.isPending) {
            submitMutation.mutate();
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Submit URLs</span>
          <textarea
            value={urlsText}
            onChange={(event) => setUrlsText(event.target.value)}
            placeholder={`https://${domain}/new-page`}
            rows={4}
            className="textarea textarea-bordered w-full font-mono text-xs"
          />
          <span className="text-xs text-base-content/50">
            One URL per line. You can also submit every indexable page from a
            site audit.
          </span>
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={urls.length === 0 || submitMutation.isPending}
          >
            Submit to IndexNow
          </button>
        </div>
      </form>
    </div>
  );
}
