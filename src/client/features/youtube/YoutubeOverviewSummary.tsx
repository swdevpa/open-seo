import { YoutubeKpiCards } from "./YoutubeKpiCards";

type YoutubeOverviewChannel = Parameters<typeof YoutubeKpiCards>[0] & {
  channelId: string;
};

export function YoutubeOverviewSummary({
  channels,
}: {
  channels: YoutubeOverviewChannel[];
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

export function YoutubeOverviewSkeleton() {
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
      <div className="h-96 animate-pulse rounded-xl bg-base-200" />
    </div>
  );
}
