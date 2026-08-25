export class YoutubeApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: string | null = null,
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

export class YoutubeTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "YoutubeTokenError";
  }
}

export class YoutubeMalformedResponseError extends Error {
  constructor(message = "YouTube returned an invalid response.") {
    super(message);
    this.name = "YoutubeMalformedResponseError";
  }
}
