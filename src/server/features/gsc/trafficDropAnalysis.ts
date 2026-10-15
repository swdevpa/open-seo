import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * Pure comparison and cause-ranking rules for diagnose_traffic_drop, kept
 * apart from the service that loads Search Console, audit, and GA4 data.
 */

// Average position is noisy; a full place worse is treated as a ranking loss.
const POSITION_DROP_THRESHOLD = 1;
const DEMAND_DROP_RATIO = 0.9;
// GA4 falling this many percentage points more than GSC clicks points at tracking.
const MEASUREMENT_GAP_POINTS = 20;

type LossReason = "position_drop" | "not_ranking" | "demand_drop" | "ctr_drop";

type LossRow = {
  key: string;
  previousClicks: number;
  currentClicks: number;
  clickChange: number;
  previousImpressions: number;
  currentImpressions: number;
  impressionChange: number;
  previousPosition: number | null;
  currentPosition: number | null;
  positionDropped: boolean;
  reason: LossReason;
};

export type PageCheck = {
  page: string;
  clickChange: number;
  audit: {
    statusCode: number | null;
    flags: Array<"noindex" | "non_200" | "canonicalized" | "blocked">;
    canonicalUrl: string | null;
  } | null;
  ga4: {
    previousSessions: number;
    currentSessions: number;
    previousEngagementRate: number | null;
    currentEngagementRate: number | null;
  } | null;
};

type Cause = {
  cause:
    | "ranking_loss"
    | "demand_drop"
    | "technical_indexing"
    | "measurement"
    | "serp_ctr_change";
  weight: number;
  evidence: string[];
};

function classify(
  previous: GscSearchAnalyticsRow,
  current: GscSearchAnalyticsRow | undefined,
): LossReason {
  if (!current) return "not_ranking";
  if (current.position - previous.position >= POSITION_DROP_THRESHOLD) {
    return "position_drop";
  }
  if (current.impressions < previous.impressions * DEMAND_DROP_RATIO) {
    return "demand_drop";
  }
  return "ctr_drop";
}

/** Join two periods by their first key and keep rows that lost clicks or
 *  impressions, biggest click loss first. */
export function compareRows(
  previousRows: GscSearchAnalyticsRow[],
  currentRows: GscSearchAnalyticsRow[],
): LossRow[] {
  const currentByKey = new Map(
    currentRows.map((row) => [row.keys?.[0] ?? "", row]),
  );
  const losses: LossRow[] = [];
  for (const previous of previousRows) {
    const key = previous.keys?.[0];
    if (!key) continue;
    const current = currentByKey.get(key);
    const currentClicks = current?.clicks ?? 0;
    const currentImpressions = current?.impressions ?? 0;
    if (
      currentClicks >= previous.clicks &&
      currentImpressions >= previous.impressions
    ) {
      continue;
    }
    const reason = classify(previous, current);
    losses.push({
      key,
      previousClicks: previous.clicks,
      currentClicks,
      clickChange: currentClicks - previous.clicks,
      previousImpressions: previous.impressions,
      currentImpressions,
      impressionChange: currentImpressions - previous.impressions,
      previousPosition: previous.position,
      currentPosition: current?.position ?? null,
      positionDropped: reason === "position_drop" || reason === "not_ranking",
      reason,
    });
  }
  return losses.toSorted(
    (a, b) =>
      a.clickChange - b.clickChange || a.impressionChange - b.impressionChange,
  );
}

export function percentChange(
  previous: number,
  current: number,
): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function clickLoss(rows: LossRow[]): number {
  return rows.reduce((sum, row) => sum + Math.max(-row.clickChange, 0), 0);
}

function formatPosition(value: number | null): string {
  return value === null ? "not ranking" : value.toFixed(1);
}

export function rankCauses(input: {
  queryLosses: LossRow[];
  pageChecks: PageCheck[];
  totals: { previousClicks: number; currentClicks: number };
  ga4Totals: { previousSessions: number; currentSessions: number } | null;
}): Cause[] {
  const { queryLosses, pageChecks, totals, ga4Totals } = input;
  const totalQueryLoss = clickLoss(queryLosses);
  const causes: Cause[] = [];
  const share = (rows: LossRow[]) =>
    totalQueryLoss > 0 ? clickLoss(rows) / totalQueryLoss : 0;
  const examples = (rows: LossRow[]) =>
    rows
      .slice(0, 3)
      .map(
        (row) =>
          `"${row.key}": ${row.previousClicks}→${row.currentClicks} clicks, position ${formatPosition(row.previousPosition)}→${formatPosition(row.currentPosition)}, impressions ${row.previousImpressions}→${row.currentImpressions}`,
      );

  const ranking = queryLosses.filter((row) => row.positionDropped);
  if (ranking.length > 0) {
    causes.push({
      cause: "ranking_loss",
      weight: share(ranking),
      evidence: [
        `${ranking.length} losing queries ranked worse or stopped appearing, accounting for ${Math.round(share(ranking) * 100)}% of the query click loss.`,
        ...examples(ranking),
      ],
    });
  }
  const demand = queryLosses.filter((row) => row.reason === "demand_drop");
  if (demand.length > 0) {
    causes.push({
      cause: "demand_drop",
      weight: share(demand),
      evidence: [
        `${demand.length} losing queries kept their position but got fewer impressions (less search demand or seasonality), ${Math.round(share(demand) * 100)}% of the query click loss.`,
        ...examples(demand),
      ],
    });
  }
  const ctr = queryLosses.filter((row) => row.reason === "ctr_drop");
  if (ctr.length > 0) {
    causes.push({
      cause: "serp_ctr_change",
      weight: share(ctr),
      evidence: [
        `${ctr.length} losing queries kept position and impressions but got fewer clicks (SERP features, AI answers, or a weaker snippet), ${Math.round(share(ctr) * 100)}% of the query click loss.`,
        ...examples(ctr),
      ],
    });
  }

  const flagged = pageChecks.filter(
    (check) => check.audit && check.audit.flags.length > 0,
  );
  if (flagged.length > 0) {
    const checkedLoss = pageChecks.reduce(
      (sum, check) => sum + Math.max(-check.clickChange, 0),
      0,
    );
    const flaggedLoss = flagged.reduce(
      (sum, check) => sum + Math.max(-check.clickChange, 0),
      0,
    );
    causes.push({
      cause: "technical_indexing",
      weight: checkedLoss > 0 ? flaggedLoss / checkedLoss : 0,
      evidence: flagged.map(
        (check) =>
          `${check.page} lost ${-check.clickChange} clicks and the latest audit flags it: ${check.audit?.flags.join(", ")}.`,
      ),
    });
  }

  if (ga4Totals) {
    const gscChange = percentChange(
      totals.previousClicks,
      totals.currentClicks,
    );
    const ga4Change = percentChange(
      ga4Totals.previousSessions,
      ga4Totals.currentSessions,
    );
    if (
      gscChange !== null &&
      ga4Change !== null &&
      gscChange - ga4Change >= MEASUREMENT_GAP_POINTS
    ) {
      causes.push({
        cause: "measurement",
        weight: Math.min((gscChange - ga4Change) / 100, 1),
        evidence: [
          `GA4 organic sessions changed ${ga4Change.toFixed(0)}% while Search Console clicks changed ${gscChange.toFixed(0)}%. A gap this large usually means tracking, consent, or channel attribution changed rather than search traffic.`,
        ],
      });
    }
  }

  return causes
    .filter((cause) => cause.weight > 0)
    .toSorted((a, b) => b.weight - a.weight)
    .map((cause) => ({
      ...cause,
      weight: Math.round(cause.weight * 100) / 100,
    }));
}
