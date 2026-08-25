import { AppError } from "@/server/lib/errors";

export type YoutubeDateRange = {
  startDate: string;
  endDate: string;
  endDateWasClamped: boolean;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, field: string): Date {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new AppError("VALIDATION_ERROR", `${field} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError("VALIDATION_ERROR", `${field} is not a valid date.`);
  }
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Return the last complete UTC day. Analytics may still be changing today. */
export function getLastCompleteYoutubeDate(now = new Date()): string {
  return formatDate(addDays(now, -1));
}

export function getDefaultYoutubeDateRange(now = new Date()): YoutubeDateRange {
  const endDate = getLastCompleteYoutubeDate(now);
  const end = parseDate(endDate, "endDate");
  return {
    startDate: formatDate(addDays(end, -27)),
    endDate,
    endDateWasClamped: false,
  };
}

export function resolveYoutubeDateRange(input: {
  startDate?: string;
  endDate?: string;
  now?: Date;
}): YoutubeDateRange {
  const latestDate = getLastCompleteYoutubeDate(input.now);
  const latest = parseDate(latestDate, "endDate");
  const requestedEnd = input.endDate
    ? parseDate(input.endDate, "endDate")
    : latest;
  const end = requestedEnd > latest ? latest : requestedEnd;
  const start = input.startDate
    ? parseDate(input.startDate, "startDate")
    : addDays(end, -27);
  if (start > end) {
    throw new AppError(
      "VALIDATION_ERROR",
      "startDate must be on or before endDate.",
    );
  }
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    endDateWasClamped: requestedEnd > latest,
  };
}
