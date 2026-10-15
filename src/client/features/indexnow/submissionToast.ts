import { toast } from "sonner";
import type { submitIndexNowUrls } from "@/serverFunctions/indexnow";

type IndexNowSubmission = Awaited<ReturnType<typeof submitIndexNowUrls>>;

// One toast per submission: success when every host accepted, otherwise the
// first failing host's reason, which is what the user has to fix.
export function showIndexNowSubmissionToast(submission: IndexNowSubmission) {
  const skipped =
    submission.rejectedUrls.length > 0
      ? ` Skipped ${submission.rejectedUrls.length} URL(s) outside the project domain.`
      : "";
  const failed = submission.results.find((result) => !result.ok);

  if (submission.results.length === 0) {
    toast.error(`No URLs to submit.${skipped}`);
    return;
  }
  if (failed) {
    toast.error(`${failed.host}: ${failed.message}${skipped}`);
    return;
  }
  toast.success(
    `Submitted ${submission.submittedCount} URL(s) to IndexNow.${skipped}`,
  );
}
