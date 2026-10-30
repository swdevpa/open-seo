import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";
import { normalizePageKey } from "@/server/lib/pageKey";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import {
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";
import { GscService } from "@/server/features/gsc/services/GscService";
import {
  compareRows,
  percentChange,
  rankCauses,
  type PageCheck,
} from "@/server/features/gsc/trafficDropAnalysis";

const LOSER_LIMIT = 20;
const CHECKED_PAGE_LIMIT = 10;

function auditFlags(page: {
  statusCode: number | null;
  fetchClass: "ok" | "blocked" | "error" | "rate_limited";
  isIndexable: boolean;
  url: string;
  canonicalUrl: string | null;
  headerCanonicalUrl: string | null;
}) {
  const flags: NonNullable<PageCheck["audit"]>["flags"] = [];
  if (page.fetchClass === "blocked") flags.push("blocked");
  if (page.statusCode !== null && page.statusCode !== 200) {
    flags.push("non_200");
  }
  if (!page.isIndexable) flags.push("noindex");
  const canonical = page.canonicalUrl ?? page.headerCanonicalUrl;
  if (canonical && normalizePageKey(canonical) !== normalizePageKey(page.url)) {
    flags.push("canonicalized");
  }
  return { flags, canonical };
}

async function loadAuditPages(projectId: string, diagnostics: string[]) {
  const audit = await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) {
    diagnostics.push(
      "No site audit exists for this project, so technical page status was not checked. Run run_site_audit to include it.",
    );
    return null;
  }
  const pages = await AuditRepository.getPagesForAudit(audit.id);
  diagnostics.push(
    `Technical status comes from audit ${audit.id} (${audit.status}, started ${audit.startedAt}); it reflects the site at crawl time.`,
  );
  return new Map(
    pages.flatMap((page) => {
      const key = normalizePageKey(page.url);
      return key ? [[key, page] as const] : [];
    }),
  );
}

type Period = { startDate: string; endDate: string };

async function loadGa4Sessions(
  projectId: string,
  periods: { previous: Period; current: Period },
  diagnostics: string[],
) {
  const connection = await Ga4ConnectionRepository.getByProjectId(projectId);
  if (!connection) {
    diagnostics.push(
      "Google Analytics is not connected, so session changes and measurement issues were not checked.",
    );
    return null;
  }
  const loadPeriod = async (period: Period) => {
    const report = await Ga4ReportingService.runReport({
      projectId,
      kind: "landing_pages",
      startDate: period.startDate,
      endDate: period.endDate,
      limit: 1_000,
      channel: "organic_search",
    });
    const byPage = new Map<string, { sessions: number; rate: number }>();
    let totalSessions = 0;
    for (const row of report.rows) {
      const sessions = typeof row.sessions === "number" ? row.sessions : 0;
      totalSessions += sessions;
      const key = normalizePageKey(
        `${String(row.hostName ?? "")}${String(row.landingPage ?? "")}`,
      );
      if (!key) continue;
      byPage.set(key, {
        sessions,
        rate: typeof row.engagementRate === "number" ? row.engagementRate : 0,
      });
    }
    return { byPage, totalSessions };
  };
  try {
    const [previous, current] = await Promise.all([
      loadPeriod(periods.previous),
      loadPeriod(periods.current),
    ]);
    return { previous, current };
  } catch (error) {
    diagnostics.push(
      `Google Analytics could not be read (${error instanceof Error ? error.message : String(error)}); session changes were skipped.`,
    );
    return null;
  }
}

async function diagnose(
  input: { projectId: string; startDate?: string; endDate?: string },
  opts: { now?: Date } = {},
) {
  const current = resolveDateRange(input, opts.now);
  const previous = previousPeriod(current.startDate, current.endDate);
  const fetchRows = (period: Period, dimension: "query" | "page" | "date") =>
    GscService.getPerformance({
      projectId: input.projectId,
      dimensions: [dimension],
      startDate: period.startDate,
      endDate: period.endDate,
      rowLimit: 1_000,
      type: "web",
    }).then((result) => result.rows);

  const [
    previousDates,
    currentDates,
    previousQueries,
    currentQueries,
    previousPages,
    currentPages,
  ] = await Promise.all([
    fetchRows(previous, "date"),
    fetchRows(current, "date"),
    fetchRows(previous, "query"),
    fetchRows(current, "query"),
    fetchRows(previous, "page"),
    fetchRows(current, "page"),
  ]);

  const previousTotals = sumSearchTotals(previousDates);
  const currentTotals = sumSearchTotals(currentDates);
  const queryLosses = compareRows(previousQueries, currentQueries);
  const pageLosses = compareRows(previousPages, currentPages);
  const diagnostics: string[] = [
    "Search Console reports the top 1,000 queries and pages per period; anonymized queries are not included in query-level losses.",
  ];

  const [auditPages, ga4] = await Promise.all([
    loadAuditPages(input.projectId, diagnostics),
    loadGa4Sessions(input.projectId, { previous, current }, diagnostics),
  ]);

  const pageChecks: PageCheck[] = pageLosses
    .slice(0, CHECKED_PAGE_LIMIT)
    .map((loss) => {
      const key = normalizePageKey(loss.key);
      const auditPage = key ? auditPages?.get(key) : undefined;
      const before = key ? ga4?.previous.byPage.get(key) : undefined;
      const after = key ? ga4?.current.byPage.get(key) : undefined;
      const audit = auditPage ? auditFlags(auditPage) : null;
      return {
        page: loss.key,
        clickChange: loss.clickChange,
        audit: audit
          ? {
              statusCode: auditPage?.statusCode ?? null,
              flags: audit.flags,
              canonicalUrl: audit.canonical,
            }
          : null,
        ga4: ga4
          ? {
              previousSessions: before?.sessions ?? 0,
              currentSessions: after?.sessions ?? 0,
              previousEngagementRate: before?.rate ?? null,
              currentEngagementRate: after?.rate ?? null,
            }
          : null,
      };
    });
  if (auditPages && pageChecks.some((check) => !check.audit)) {
    diagnostics.push(
      "Some losing pages were not in the latest audit crawl; their technical status is unknown.",
    );
  }

  const causes =
    currentTotals.clicks < previousTotals.clicks
      ? rankCauses({
          queryLosses,
          pageChecks,
          totals: {
            previousClicks: previousTotals.clicks,
            currentClicks: currentTotals.clicks,
          },
          ga4Totals: ga4
            ? {
                previousSessions: ga4.previous.totalSessions,
                currentSessions: ga4.current.totalSessions,
              }
            : null,
        })
      : [];
  if (currentTotals.clicks >= previousTotals.clicks) {
    diagnostics.push(
      "Total clicks did not fall between the two periods, so no causes were ranked.",
    );
  }

  return {
    currentPeriod: current,
    previousPeriod: previous,
    totals: {
      previous: previousTotals,
      current: currentTotals,
      clickChangePercent: percentChange(
        previousTotals.clicks,
        currentTotals.clicks,
      ),
      impressionChangePercent: percentChange(
        previousTotals.impressions,
        currentTotals.impressions,
      ),
    },
    causes,
    losingQueries: queryLosses.slice(0, LOSER_LIMIT),
    losingPages: pageLosses.slice(0, LOSER_LIMIT),
    pageChecks,
    diagnostics,
  };
}

export const TrafficDropService = { diagnose };
