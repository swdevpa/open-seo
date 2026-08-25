import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw, Unplug, Youtube } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { defaultYoutubeDateRange, type YoutubeSearch } from "./youtubeSearch";
import { startYoutubeLink } from "./startYoutubeLink";
import { YoutubeDateRangeControls } from "./YoutubeDateRangeControls";
import { YoutubeKpiCards } from "./YoutubeKpiCards";
import {
  disconnectYoutubeChannel,
  getYoutubeChannelDetail,
} from "@/serverFunctions/youtube";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
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

export function YoutubeDetailPage({
  projectId,
  channelId,
  search,
}: {
  projectId: string;
  channelId: string;
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

  const detailQuery = useQuery({
    queryKey: [
      "youtubeChannelDetail",
      projectId,
      channelId,
      startDate,
      endDate,
    ],
    queryFn: () =>
      getYoutubeChannelDetail({
        data: { projectId, channelId, startDate, endDate },
      }),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const detail = detailQuery.data;

  useEffect(() => {
    if (!search.youtube) return;
    if (search.youtube === "connected")
      toast.success("YouTube channel connected");
    else toast.error("Could not connect the YouTube channel.");
    void navigate({
      to: "/p/$projectId/youtube/$channelId",
      params: { projectId, channelId },
      search: { startDate: search.startDate, endDate: search.endDate },
      replace: true,
    });
  }, [
    channelId,
    navigate,
    projectId,
    search.endDate,
    search.startDate,
    search.youtube,
  ]);

  useEffect(() => {
    if (!detail?.range) return;
    setStartDate(detail.range.startDate);
    setEndDate(detail.range.endDate);
  }, [detail?.range]);

  const disconnectMutation = useMutation({
    mutationFn: () =>
      disconnectYoutubeChannel({ data: { projectId, channelId } }),
    onSuccess: () => {
      toast.success("YouTube channel disconnected");
      void queryClient.invalidateQueries({
        queryKey: ["youtubeOverview", projectId],
      });
      void navigate({
        to: "/p/$projectId/youtube",
        params: { projectId },
        search: { startDate, endDate },
      });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const applyRange = (range: { startDate: string; endDate: string }) => {
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    void navigate({
      to: "/p/$projectId/youtube/$channelId",
      params: { projectId, channelId },
      search: range,
      replace: true,
    });
  };

  const connect = () => void startYoutubeLink(projectId, window.location.href);

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              to="/p/$projectId/youtube"
              params={{ projectId }}
              search={{ startDate, endDate }}
              className="mb-3 inline-flex items-center gap-1 text-sm text-base-content/60 hover:text-base-content"
            >
              <ArrowLeft className="size-4" />
              All channels
            </Link>
            <div className="flex items-center gap-3">
              {detail?.thumbnailUrl ? (
                <img
                  src={detail.thumbnailUrl}
                  alt=""
                  className="size-11 rounded-full object-cover"
                />
              ) : (
                <span className="grid size-11 place-items-center rounded-full bg-error/10 text-error">
                  <Youtube className="size-5" />
                </span>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">
                    {detail?.channelName ?? "YouTube channel"}
                  </h1>
                  {detail ? <StatusPill status={detail.status} /> : null}
                </div>
                {detail?.channelHandle ? (
                  <p className="text-sm text-base-content/60">
                    {detail.channelHandle}
                  </p>
                ) : null}
              </div>
            </div>
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
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: [
                    "youtubeChannelDetail",
                    projectId,
                    channelId,
                    startDate,
                    endDate,
                  ],
                  exact: true,
                })
              }
              disabled={detailQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${detailQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1.5 text-error hover:bg-error/10"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              <Unplug className="size-4" />
              Disconnect
            </button>
          </div>
        </div>

        {detailQuery.isError ? (
          <div className="alert alert-error text-sm">
            {getStandardErrorMessage(
              detailQuery.error,
              "Could not load YouTube data.",
            )}
          </div>
        ) : null}

        {detailQuery.isPending ? (
          <div className="space-y-4" aria-label="Loading YouTube channel data">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-xl bg-base-200"
                />
              ))}
            </div>
            <div className="h-96 animate-pulse rounded-xl bg-base-200" />
          </div>
        ) : detail ? (
          <>
            {detail.status === "reconnect" ? (
              <div className="alert alert-warning flex items-center justify-between gap-3 text-sm">
                <span>
                  Reconnect this channel to load current YouTube data.
                </span>
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={connect}
                >
                  Reconnect
                </button>
              </div>
            ) : detail.status === "unavailable" ? (
              <div className="alert alert-info text-sm">
                YouTube data is temporarily unavailable. Try Refresh again
                later.
              </div>
            ) : null}
            <YoutubeKpiCards
              current={detail.current}
              period={detail.period}
              detail
            />
            <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Activity over time</h2>
                  <p className="text-xs text-base-content/60">
                    {detail.seriesGranularity === "day"
                      ? "Daily activity"
                      : `Grouped by ${detail.seriesGranularity}`}
                  </p>
                </div>
                {detailQuery.isFetching && !detailQuery.isPending ? (
                  <Loader2 className="size-4 animate-spin text-base-content/45" />
                ) : null}
              </div>
              {detail.series.length === 0 ? (
                <div className="grid h-80 place-items-center text-sm text-base-content/55">
                  No activity data for this range.
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={detail.series}
                      margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                    >
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: string) =>
                          detail.seriesGranularity === "month"
                            ? value.slice(0, 7)
                            : value.slice(5)
                        }
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <Tooltip
                        formatter={(
                          value: number | undefined,
                          name: string | undefined,
                        ) => [formatNumber(value ?? 0), name ?? ""]}
                        labelFormatter={(label) => String(label)}
                      />
                      <Line
                        type="monotone"
                        dataKey="views"
                        name="Views"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="likes"
                        name="Likes"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="comments"
                        name="Comments"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="netSubscribers"
                        name="Net subscribers"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        ) : null}
        {detail?.range ? (
          <p className="text-xs text-base-content/50">
            {detail.range.startDate} to {detail.range.endDate}. YouTube data is
            read-only.
          </p>
        ) : null}
      </div>
    </div>
  );
}
