import { describe, expect, it } from "vitest";
import {
  getDefaultYoutubeDateRange,
  resolveYoutubeDateRange,
} from "./YoutubeDates";

describe("YouTube date ranges", () => {
  it("uses the last 28 complete days by default", () => {
    expect(
      getDefaultYoutubeDateRange(new Date("2026-08-25T12:00:00.000Z")),
    ).toMatchObject({
      startDate: "2026-07-28",
      endDate: "2026-08-24",
      endDateWasClamped: false,
    });
  });

  it("clamps an end date after the last complete day", () => {
    expect(
      resolveYoutubeDateRange({
        startDate: "2026-08-01",
        endDate: "2026-08-30",
        now: new Date("2026-08-25T12:00:00.000Z"),
      }),
    ).toMatchObject({
      startDate: "2026-08-01",
      endDate: "2026-08-24",
      endDateWasClamped: true,
    });
  });

  it.each([
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-08-25", endDate: "2026-08-24" },
    { startDate: "2026/08/01", endDate: "2026-08-02" },
  ])("rejects invalid range %#", (range) => {
    expect(() =>
      resolveYoutubeDateRange({
        ...range,
        now: new Date("2026-08-25T12:00:00.000Z"),
      }),
    ).toThrow(/date|Date/);
  });
});
