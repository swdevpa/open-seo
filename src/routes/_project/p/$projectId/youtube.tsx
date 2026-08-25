import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/youtube")({
  component: YoutubeRoute,
});

function YoutubeRoute() {
  return <Outlet />;
}
