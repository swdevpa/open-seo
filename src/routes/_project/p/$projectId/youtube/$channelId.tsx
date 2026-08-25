import { createFileRoute } from "@tanstack/react-router";
import { YoutubeDetailPage } from "@/client/features/youtube/YoutubeDetailPage";
import { youtubeSearchSchema } from "@/client/features/youtube/youtubeSearch";

export const Route = createFileRoute(
  "/_project/p/$projectId/youtube/$channelId",
)({
  validateSearch: youtubeSearchSchema,
  component: YoutubeDetailRoute,
});

function YoutubeDetailRoute() {
  const { projectId, channelId } = Route.useParams();
  return (
    <YoutubeDetailPage
      projectId={projectId}
      channelId={channelId}
      search={Route.useSearch()}
    />
  );
}
