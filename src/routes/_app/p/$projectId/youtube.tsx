import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/p/$projectId/youtube")({
  component: YoutubeRoute,
});

function YoutubeRoute() {
  return <Outlet />;
}
