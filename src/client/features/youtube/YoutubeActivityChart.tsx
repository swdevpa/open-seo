import { Loader2 } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YoutubeMetrics } from "@/shared/youtube";

type YoutubeSeriesGranularity = "day" | "week" | "month";
type YoutubeSeriesPoint = YoutubeMetrics & { date: string };

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function YoutubeActivityChart({
  title,
  range,
  series,
  seriesGranularity,
  seriesCoverage,
  isFetching = false,
}: {
  title: string;
  range: { startDate: string; endDate: string };
  series: YoutubeSeriesPoint[];
  seriesGranularity: YoutubeSeriesGranularity;
  seriesCoverage?: {
    includedChannels: number;
    totalChannels: number;
  };
  isFetching?: boolean;
}) {
  const subtitle =
    seriesGranularity === "day"
      ? "Daily activity"
      : `Grouped by ${seriesGranularity}`;
  const hasPartialCoverage =
    seriesCoverage &&
    seriesCoverage.includedChannels < seriesCoverage.totalChannels;

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-base-content/60">
            {subtitle} · {range.startDate} to {range.endDate}
          </p>
          {hasPartialCoverage ? (
            <p className="mt-1 text-xs text-warning">
              Chart includes data from {seriesCoverage.includedChannels} of{" "}
              {seriesCoverage.totalChannels} channels.
            </p>
          ) : null}
        </div>
        {isFetching ? (
          <Loader2 className="size-4 animate-spin text-base-content/45" />
        ) : null}
      </div>
      {series.length === 0 ? (
        <div className="grid h-80 place-items-center text-sm text-base-content/55">
          No activity data for this range.
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            >
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) =>
                  seriesGranularity === "month"
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
                name="Analytics views"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="engagedViews"
                name="Engaged views"
                stroke="#a855f7"
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
  );
}
