import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { normalizePageKey } from "@/server/lib/pageKey";
import { GscService } from "@/server/features/gsc/services/GscService";
import { CONTENT_DECAY_DEFAULT_MONTHS } from "@/types/schemas/search-performance";

// Below this, month-over-month declines are mostly noise.
const MIN_BASELINE_CLICKS = 10;
const MAX_ROWS = 100;
// GSC data trails by ~3 days; a month only counts once it is fully reported.
const GSC_DATA_LAG_DAYS = 3;

type Month = { month: string; startDate: string; endDate: string };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last `count` complete calendar months, oldest first. */
function completeMonths(count: number, now: Date): Month[] {
  const lagged = new Date(now);
  lagged.setUTCDate(lagged.getUTCDate() - GSC_DATA_LAG_DAYS);
  const months: Month[] = [];
  for (let offset = count; offset >= 1; offset--) {
    const start = new Date(
      Date.UTC(lagged.getUTCFullYear(), lagged.getUTCMonth() - offset, 1),
    );
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    );
    months.push({
      month: isoDate(start).slice(0, 7),
      startDate: isoDate(start),
      endDate: isoDate(end),
    });
  }
  return months;
}

async function loadWordCounts(projectId: string) {
  const audit = await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) return null;
  const pages = await AuditRepository.getPagesForAudit(audit.id);
  return new Map(
    pages.flatMap((page) => {
      const key = normalizePageKey(page.url);
      return key ? [[key, page.wordCount] as const] : [];
    }),
  );
}

/** Pages whose Search Console clicks fell in every one of the last `months`
 *  complete months, compared with the month before them. */
async function getContentDecay(
  input: { projectId: string; months?: number },
  opts: { now?: Date } = {},
) {
  const monthCount = input.months ?? CONTENT_DECAY_DEFAULT_MONTHS;
  // One extra month is the baseline the first decline is measured against.
  const months = completeMonths(monthCount + 1, opts.now ?? new Date());
  const fetchPages = (
    startDate: string,
    endDate: string,
    dimensions: ("page" | "query")[],
  ) =>
    GscService.getPerformance({
      projectId: input.projectId,
      dimensions,
      startDate,
      endDate,
      rowLimit: 1_000,
      type: "web",
    }).then((result) => result.rows);

  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) throw new Error("No months to compare.");
  const [monthlyRows, pageQueries, wordCounts] = await Promise.all([
    Promise.all(
      months.map((month) =>
        fetchPages(month.startDate, month.endDate, ["page"]),
      ),
    ),
    fetchPages(first.startDate, last.endDate, ["page", "query"]),
    loadWordCounts(input.projectId),
  ]);

  const byMonth = monthlyRows.map(
    (rows) => new Map(rows.map((row) => [row.keys?.[0] ?? "", row])),
  );
  // GSC sorts by clicks, so the first row seen per page is its top query.
  const topQueryByPage = new Map<string, string>();
  for (const row of pageQueries) {
    const [page, query] = row.keys ?? [];
    if (page && query && !topQueryByPage.has(page)) {
      topQueryByPage.set(page, query);
    }
  }

  const rows = (monthlyRows[0] ?? []).flatMap((baseline) => {
    const page = baseline.keys?.[0];
    if (!page || baseline.clicks < MIN_BASELINE_CLICKS) return [];
    const series = byMonth.map((rowsByPage) => rowsByPage.get(page));
    const clicks = series.map((row) => row?.clicks ?? 0);
    const declinedEveryMonth = clicks.every(
      (value, index) => index === 0 || value < (clicks[index - 1] ?? 0),
    );
    if (!declinedEveryMonth) return [];
    const latest = series[series.length - 1];
    const key = normalizePageKey(page);
    const totalLoss = (clicks[0] ?? 0) - (clicks[clicks.length - 1] ?? 0);
    return [
      {
        page,
        monthlyClicks: clicks,
        totalLoss,
        lossPercent: Math.round((totalLoss / baseline.clicks) * 100),
        position: latest?.position ?? null,
        topQuery: topQueryByPage.get(page) ?? null,
        wordCount: key ? (wordCounts?.get(key) ?? null) : null,
      },
    ];
  });

  return {
    months: months.map((month) => month.month),
    rows: rows.toSorted((a, b) => b.totalLoss - a.totalLoss).slice(0, MAX_ROWS),
    totalDecaying: rows.length,
    auditAvailable: wordCounts !== null,
  };
}

export const ContentDecayService = { getContentDecay };
