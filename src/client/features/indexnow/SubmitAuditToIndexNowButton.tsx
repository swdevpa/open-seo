import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getIndexNowSetup,
  submitAuditToIndexNow,
} from "@/serverFunctions/indexnow";

// Pages the server submits: fetched OK, indexable, not behind bot protection.
// Mirrors IndexNowService.submitAuditPages so the label matches the request.
export function countIndexNowEligiblePages(
  pages: Array<{
    statusCode: number | null;
    isIndexable: boolean;
    fetchClass: string | null;
  }>,
) {
  return pages.filter(
    (page) =>
      page.statusCode === 200 &&
      page.isIndexable &&
      page.fetchClass !== "blocked",
  ).length;
}

const pluralUrls = (count: number) => `${count} URL${count === 1 ? "" : "s"}`;

type AuditSubmission = Awaited<ReturnType<typeof submitAuditToIndexNow>>;

function showSubmissionToasts(result: AuditSubmission) {
  const sent = result.hosts
    .filter((host) => host.status === "submitted")
    .reduce((count, host) => count + host.urlCount, 0);
  for (const host of result.hosts) {
    if (host.status !== "failed") continue;
    toast.error("Couldn't submit to IndexNow", {
      description: host.message,
      duration: 10_000,
    });
  }
  if (sent > 0) toast.success(`Submitted ${pluralUrls(sent)}`);
  if (result.skipped.length > 0) {
    toast.warning(
      `Skipped ${pluralUrls(result.skipped.length)} not on the project's website`,
    );
  }
}

export function SubmitAuditToIndexNowButton({
  projectId,
  auditId,
  eligibleCount,
}: {
  projectId: string;
  auditId: string;
  eligibleCount: number;
}) {
  // Same key as IndexNowSettings, so setting it up there updates this button.
  const setupQuery = useQuery({
    queryKey: ["indexnow-setup", projectId],
    queryFn: () => getIndexNowSetup({ data: { projectId } }),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitAuditToIndexNow({ data: { projectId, auditId } }),
    onSuccess: showSubmissionToasts,
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Couldn't submit to IndexNow"),
      ),
  });

  if (!setupQuery.data || eligibleCount === 0) return null;

  if (!setupQuery.data.domain || !setupQuery.data.key) {
    return (
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={
          <Link
            to="/p/$projectId/settings/integrations"
            params={{ projectId }}
            hash="indexnow"
          />
        }
      >
        <Send data-icon="inline-start" />
        Set up IndexNow
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => submitMutation.mutate()}
      pending={submitMutation.isPending}
      title="Submit every indexable page from this audit to IndexNow"
    >
      {submitMutation.isPending ? null : <Send data-icon="inline-start" />}
      Submit {eligibleCount} to IndexNow
    </Button>
  );
}
