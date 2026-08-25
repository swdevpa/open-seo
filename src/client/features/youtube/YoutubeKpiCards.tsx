import type { YoutubeMetrics } from "@/shared/youtube";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

export function YoutubeKpiCards({
  current,
  period,
  detail = false,
}: {
  current: {
    viewCount: number;
    subscriberCount: number;
    videoCount: number;
  } | null;
  period: YoutubeMetrics | null;
  detail?: boolean;
}) {
  const cards = [
    {
      label: "Subscribers",
      value: formatNumber(current?.subscriberCount ?? 0),
    },
    { label: "Total views", value: formatNumber(current?.viewCount ?? 0) },
    { label: "Views in period", value: formatNumber(period?.views ?? 0) },
    { label: "Likes", value: formatNumber(period?.likes ?? 0) },
    { label: "Comments", value: formatNumber(period?.comments ?? 0) },
    {
      label: "Net subscribers",
      value: formatSigned(period?.netSubscribers ?? 0),
    },
  ];
  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${detail ? "xl:grid-cols-6" : "xl:grid-cols-6"}`}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
            {card.label}
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
