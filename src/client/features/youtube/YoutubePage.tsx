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
import { YoutubeDateRangeControls } from "./YoutubeDateRangeControls";
import { YoutubeKpiCards } from "./YoutubeKpiCards";
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
        : "border-base-300 bg-base-200 text-base-content/65";
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
    <span className="grid size-9 place-items-center rounded-full bg-error/10 text-error">
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
              <span className="grid size-8 place-items-center rounded-lg border border-base-300 bg-base-100 text-error shadow-sm">
                <Youtube className="size-5" />
              </span>
              <h1 className="text-2xl font-semibold">YouTube channels</h1>
            </div>
            <p className="mt-1 text-sm text-base-content/70">
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
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1.5"
              onClick={refresh}
              disabled={overviewQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-error btn-sm gap-1.5 text-white"
              onClick={connect}
            >
              <Youtube className="size-4" />
              Connect channel
            </button>
          </div>
        </div>

        {overviewQuery.isError ? (
          <div className="alert alert-error text-sm">
            {getStandardErrorMessage(
              overviewQuery.error,
              "Could not load YouTube data.",
            )}
          </div>
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
          <div className="rounded-xl border border-dashed border-base-300 bg-base-100 p-10 text-center shadow-sm">
            <Youtube className="mx-auto size-8 text-error/70" />
            <h2 className="mt-3 text-lg font-semibold">
              No YouTube channels connected
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-base-content/65">
              Connect a channel to see its current subscribers, total views, and
              period activity.
            </p>
            <button
              type="button"
              className="btn btn-error mt-5 text-white"
              onClick={connect}
            >
              Connect channel
            </button>
          </div>
        ) : (
          <>
            <YoutubeOverviewSummary channels={channels} />
            <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
                <div>
                  <h2 className="font-semibold">Connected channels</h2>
                  <p className="text-xs text-base-content/60">
                    {overview?.range.startDate} to {overview?.range.endDate}
                  </p>
                </div>
                {overviewQuery.isFetching && !overviewQuery.isPending ? (
                  <Loader2 className="size-4 animate-spin text-base-content/45" />
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th className="text-right">Subscribers</th>
                      <th className="text-right">Public lifetime views</th>
                      <th className="text-right">Analytics views</th>
                      <th className="text-right">Engaged views</th>
                      <th className="text-right">Likes</th>
                      <th className="text-right">Comments</th>
                      <th className="text-right">Net subs</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((channel) => (
                      <tr key={channel.channelId}>
                        <td>
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
                                <span className="block truncate text-xs text-base-content/55">
                                  {channel.channelHandle}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">
                          {formatNumber(channel.current?.subscriberCount ?? 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatNumber(channel.current?.viewCount ?? 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatNumber(channel.period?.views ?? 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatNumber(channel.period?.engagedViews ?? 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatNumber(channel.period?.likes ?? 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatNumber(channel.period?.comments ?? 0)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatSigned(channel.period?.netSubscribers ?? 0)}
                        </td>
                        <td>
                          <StatusPill status={channel.status} />
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            {channel.status === "reconnect" ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs text-warning"
                                onClick={connect}
                              >
                                Reconnect
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs gap-1 text-error hover:bg-error/10"
                              onClick={() =>
                                disconnectMutation.mutate(channel.channelId)
                              }
                              disabled={disconnectMutation.isPending}
                            >
                              <Unplug className="size-3.5" />
                              Disconnect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        <p className="text-xs text-base-content/50">
          YouTube may correct an end date after the last complete day. Data
          refreshes for up to five minutes from cache.
        </p>
      </div>
    </div>
  );
}

function YoutubeOverviewSummary({
  channels,
}: {
  channels: Array<
    Parameters<typeof YoutubeKpiCards>[0] & { channelId: string }
  >;
}) {
  const totals = channels.reduce(
    (result, channel) => {
      result.current.viewCount += channel.current?.viewCount ?? 0;
      result.current.subscriberCount += channel.current?.subscriberCount ?? 0;
      result.current.videoCount += channel.current?.videoCount ?? 0;
      if (channel.period) {
        result.period.views += channel.period.views;
        result.period.engagedViews += channel.period.engagedViews;
        result.period.likes += channel.period.likes;
        result.period.comments += channel.period.comments;
        result.period.subscribersGained += channel.period.subscribersGained;
        result.period.subscribersLost += channel.period.subscribersLost;
        result.period.netSubscribers += channel.period.netSubscribers;
      }
      return result;
    },
    {
      current: { viewCount: 0, subscriberCount: 0, videoCount: 0 },
      period: {
        views: 0,
        engagedViews: 0,
        likes: 0,
        comments: 0,
        subscribersGained: 0,
        subscribersLost: 0,
        netSubscribers: 0,
      },
    },
  );
  return <YoutubeKpiCards current={totals.current} period={totals.period} />;
}

function YoutubeOverviewSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading YouTube data">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl bg-base-200"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-base-200" />
    </div>
  );
}
