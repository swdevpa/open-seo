import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { showIndexNowSubmissionToast } from "@/client/features/indexnow/submissionToast";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { submitAuditToIndexNow } from "@/serverFunctions/indexnow";
import { getProjects } from "@/serverFunctions/projects";

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

export function SubmitAuditToIndexNowButton({
  projectId,
  auditId,
  eligibleCount,
}: {
  projectId: string;
  auditId: string;
  eligibleCount: number;
}) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);

  const submitMutation = useMutation({
    mutationFn: () => submitAuditToIndexNow({ data: { projectId, auditId } }),
    onSuccess: showIndexNowSubmissionToast,
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Failed to submit to IndexNow"),
      ),
  });

  if (!project || eligibleCount === 0) return null;

  if (!project.domain || !project.indexNowKey) {
    return (
      <Link
        to="/p/$projectId/settings"
        params={{ projectId }}
        hash="indexnow"
        className="btn btn-sm btn-ghost gap-1"
      >
        <Send className="size-4" />
        Set up IndexNow
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost gap-1"
      onClick={() => submitMutation.mutate()}
      disabled={submitMutation.isPending}
      title="Submit every indexable page from this audit to IndexNow"
    >
      <Send className="size-4" />
      Submit {eligibleCount} to IndexNow
    </button>
  );
}
