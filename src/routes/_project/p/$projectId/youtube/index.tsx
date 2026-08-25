import { createFileRoute } from "@tanstack/react-router";
import { YoutubePage } from "@/client/features/youtube/YoutubePage";
import { youtubeSearchSchema } from "@/client/features/youtube/youtubeSearch";

export const Route = createFileRoute("/_project/p/$projectId/youtube/")({
  validateSearch: youtubeSearchSchema,
  component: YoutubeRoute,
});

function YoutubeRoute() {
  const { projectId } = Route.useParams();
  return <YoutubePage projectId={projectId} search={Route.useSearch()} />;
}
