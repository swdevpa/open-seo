import { Alert } from "@/client/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Button } from "@/client/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw, Unplug, Youtube } from "lucide-react";
import { toast } from "sonner";
import { GoogleOAuthSetupWarning } from "@/client/features/integrations/GoogleOAuthSetupWarning";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { defaultYoutubeDateRange, type YoutubeSearch } from "./youtubeSearch";
import { startYoutubeLink } from "./startYoutubeLink";
import { YoutubeActivityChart } from "./YoutubeActivityChart";
import { YoutubeDateRangeControls } from "./YoutubeDateRangeControls";
import {
  YoutubeOverviewSkeleton,
  YoutubeOverviewSummary,
} from "./YoutubeOverviewSummary";
import {
  getYoutubeOverview,
  disconnectYoutubeChannel,
} from "@/serverFunctions/youtube";
import { YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/youtube";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function statusLabel(status: "connected" | "reconnect" | "unavailable") {
  if (status === "reconnect") return "Reconnect";
  if (status === "unavailable") return "Unavailable";
  return "Connected";
}

function StatusPill({
  status,
}: {
  status: "connected" | "reconnect" | "unavailable";
}) {
  const className =
    status === "connected"
      ? "border-success/30 bg-success/10 text-success"
      : status === "reconnect"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${className}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function ChannelAvatar({
  name,
  thumbnailUrl,
}: {
  name: string;
  thumbnailUrl: string | null;
}) {
  return thumbnailUrl ? (
    <img
      src={thumbnailUrl}
      alt={`${name} thumbnail`}
      className="size-9 rounded-full object-cover"
      loading="lazy"
    />
  ) : (
    <span className="grid size-9 place-items-center rounded-full bg-destructive/10 text-destructive">
      <Youtube className="size-4" />
    </span>
  );
}

export function YoutubePage({
  projectId,
  search,
}: {
  projectId: string;
  search: YoutubeSearch;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const defaults = useMemo(defaultYoutubeDateRange, []);
  const [startDate, setStartDate] = useState(
    search.startDate ?? defaults.startDate,
  );
  const [endDate, setEndDate] = useState(search.endDate ?? defaults.endDate);

  useEffect(() => {
    if (search.startDate) setStartDate(search.startDate);
    if (search.endDate) setEndDate(search.endDate);
  }, [search.endDate, search.startDate]);

  const overviewQuery = useQuery({
    queryKey: ["youtubeOverview", projectId, startDate, endDate],
    queryFn: () =>
      getYoutubeOverview({ data: { projectId, startDate, endDate } }),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const overview = overviewQuery.data;

  useEffect(() => {
    if (!search.youtube) return;
    if (search.youtube === "connected")
      toast.success("YouTube channel connected");
    else toast.error("Could not connect the YouTube channel.");
    void navigate({
      to: "/p/$projectId/youtube",
      params: { projectId },
      search: {
        startDate: search.startDate,
        endDate: search.endDate,
      },
      replace: true,
    });
  }, [navigate, projectId, search.endDate, search.startDate, search.youtube]);

  useEffect(() => {
    if (!overview?.range) return;
    setStartDate(overview.range.startDate);
    setEndDate(overview.range.endDate);
  }, [overview?.range]);

  const disconnectMutation = useMutation({
    mutationFn: (channelId: string) =>
      disconnectYoutubeChannel({ data: { projectId, channelId } }),
    onSuccess: () => {
      toast.success("YouTube channel disconnected");
      void queryClient.invalidateQueries({
        queryKey: ["youtubeOverview", projectId],
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const applyRange = (range: { startDate: string; endDate: string }) => {
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    void navigate({
      to: "/p/$projectId/youtube",
      params: { projectId },
      search: range,
      replace: true,
    });
  };

  const connect = () => void startYoutubeLink(projectId, window.location.href);
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: ["youtubeOverview", projectId, startDate, endDate],
      exact: true,
    });
  const channels = overview?.channels ?? [];

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg border border-border bg-card text-destructive shadow-sm">
                <Youtube className="size-5" />
              </span>
              <h1 className="text-2xl font-semibold">YouTube channels</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              See channel views, likes, comments, and subscriber activity for
              this project.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <YoutubeDateRangeControls
              startDate={startDate}
              endDate={endDate}
              onApply={applyRange}
            />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="gap-1.5"
              onClick={refresh}
              disabled={overviewQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              type="button"
              className="gap-1.5"
              onClick={connect}
            >
              <Youtube className="size-4" />
              Connect channel
            </Button>
          </div>
        </div>

        {overviewQuery.isError ? (
          <Alert variant="destructive">
            {getStandardErrorMessage(
              overviewQuery.error,
              "Could not load YouTube data.",
            )}
          </Alert>
        ) : null}

        {overview?.googleOAuthConfigured === false ? (
          <GoogleOAuthSetupWarning
            integrationName="YouTube"
            docsUrl={YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL}
          />
        ) : null}

        {overviewQuery.isPending ? (
          <YoutubeOverviewSkeleton />
        ) : channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center shadow-sm">
            <Youtube className="mx-auto size-8 text-destructive/70" />
            <h2 className="mt-3 text-lg font-semibold">
              No YouTube channels connected
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Connect a channel to see its current subscribers, total views, and
              period activity.
            </p>
            <Button type="button" className="mt-5" onClick={connect}>
              Connect channel
            </Button>
          </div>
        ) : (
          <>
            <YoutubeOverviewSummary channels={channels} />
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <h2 className="font-semibold">Connected channels</h2>
                  <p className="text-xs text-muted-foreground">
                    {overview?.range.startDate} to {overview?.range.endDate}
                  </p>
                </div>
                {overviewQuery.isFetching && !overviewQuery.isPending ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Subscribers</TableHead>
                      <TableHead className="text-right">
                        Public lifetime views
                      </TableHead>
                      <TableHead className="text-right">
                        Analytics views
                      </TableHead>
                      <TableHead className="text-right">
                        Engaged views
                      </TableHead>
                      <TableHead className="text-right">Likes</TableHead>
                      <TableHead className="text-right">Comments</TableHead>
                      <TableHead className="text-right">Net subs</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.map((channel) => (
                      <TableRow key={channel.channelId}>
                        <TableCell>
                          <Link
                            to="/p/$projectId/youtube/$channelId"
                            params={{ projectId, channelId: channel.channelId }}
                            search={{ startDate, endDate }}
                            className="flex min-w-48 items-center gap-3 hover:underline"
                          >
                            <ChannelAvatar
                              name={channel.channelName}
                              thumbnailUrl={channel.thumbnailUrl}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {channel.channelName}
                              </span>
                              {channel.channelHandle ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {channel.channelHandle}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(channel.current?.subscriberCount ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(channel.current?.viewCount ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(channel.period?.views ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(channel.period?.engagedViews ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(channel.period?.likes ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(channel.period?.comments ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatSigned(channel.period?.netSubscribers ?? 0)}
                        </TableCell>
                        <TableCell>
                          <StatusPill status={channel.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {channel.status === "reconnect" ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                type="button"
                                className="text-warning"
                                onClick={connect}
                              >
                                Reconnect
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="xs"
                              type="button"
                              className="gap-1 text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                disconnectMutation.mutate(channel.channelId)
                              }
                              disabled={disconnectMutation.isPending}
                            >
                              <Unplug className="size-3.5" />
                              Disconnect
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <YoutubeActivityChart
              title="Activity across channels"
              range={overview?.range ?? { startDate, endDate }}
              series={overview?.series ?? []}
              seriesGranularity={overview?.seriesGranularity ?? "day"}
              seriesCoverage={overview?.seriesCoverage}
              isFetching={overviewQuery.isFetching && !overviewQuery.isPending}
            />
          </>
        )}
        <p className="text-xs text-muted-foreground">
          YouTube may correct an end date after the last complete day. Data
          refreshes for up to five minutes from cache.
        </p>
      </div>
    </div>
  );
}
