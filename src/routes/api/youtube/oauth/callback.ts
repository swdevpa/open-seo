import { createFileRoute } from "@tanstack/react-router";
import { handleYoutubeOAuthCallbackRequest } from "@/server/features/youtube/youtubeOAuth";

export const Route = createFileRoute("/api/youtube/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        handleYoutubeOAuthCallbackRequest(request),
    },
  },
});
