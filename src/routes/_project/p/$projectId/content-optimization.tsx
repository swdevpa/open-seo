import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ContentOptimizationPage } from "@/client/features/content-optimization/ContentOptimizationPage";

const contentOptimizationSearchSchema = z.object({
  scanId: z.string().min(1).optional(),
});

export const Route = createFileRoute(
  "/_project/p/$projectId/content-optimization",
)({
  validateSearch: contentOptimizationSearchSchema,
  component: ContentOptimizationRoute,
});

function ContentOptimizationRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ContentOptimizationPage
      projectId={projectId}
      scanId={search.scanId}
      onScanChange={(scanId) => {
        void navigate({
          search: scanId ? { scanId } : {},
          replace: true,
        });
      }}
    />
  );
}
