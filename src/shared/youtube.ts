/** Better Auth provider ID for the project-scoped YouTube grant. */
export const YOUTUBE_OAUTH_PROVIDER_ID = "youtube";

export const YOUTUBE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export const YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_YOUTUBE.md";

export const YOUTUBE_ANALYTICS_METRICS = [
  "views",
  "engagedViews",
  "likes",
  "comments",
  "subscribersGained",
  "subscribersLost",
] as const;

export type YoutubeMetrics = {
  views: number;
  engagedViews: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  subscribersLost: number;
  netSubscribers: number;
};
