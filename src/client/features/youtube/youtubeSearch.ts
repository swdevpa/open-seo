import { z } from "zod";

export const youtubeSearchSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  youtube: z.enum(["connected", "error"]).optional(),
  reason: z.string().optional(),
});

export type YoutubeSearch = z.infer<typeof youtubeSearchSchema>;

export function lastCompleteYoutubeDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function defaultYoutubeDateRange(): {
  startDate: string;
  endDate: string;
} {
  const end = new Date(`${lastCompleteYoutubeDate()}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
