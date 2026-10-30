import { useMemo } from "react";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { DataTable, useDataTable } from "@/client/components/table/DataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  formatCount,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import {
  runExport,
  type ExportTarget,
} from "@/client/features/search-performance/SearchPerformanceParts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { getContentDecayReport } from "@/serverFunctions/searchPerformance";
import { CONTENT_DECAY_MONTHS } from "@/types/schemas/search-performance";

type ContentDecayReport = Extract<
  Awaited<ReturnType<typeof getContentDecayReport>>,
  { connected: true }
>;
type DecayRow = ContentDecayReport["rows"][number];

/** Shared by the panel and the page's export so both hit the same cache. */
export function contentDecayQueryOptions(projectId: string, months: number) {
  return queryOptions({
    queryKey: ["contentDecay", projectId, months],
    queryFn: () => getContentDecayReport({ data: { projectId, months } }),
  });
}

const rightAligned = {
  headerClassName: "text-right",
  cellClassName: "text-right tabular-nums",
} as const;

const helper = createColumnHelper<DecayRow>();

function buildColumns(months: string[]) {
  return [
    helper.accessor("page", {
      enableSorting: false,
      header: () => "Page",
      cell: ({ getValue }) => (
        <span className="block max-w-md truncate" title={getValue()}>
          {getValue()}
        </span>
      ),
    }),
    helper.accessor("monthlyClicks", {
      enableSorting: false,
      header: () => `Clicks ${months[0] ?? ""} → ${months.at(-1) ?? ""}`,
      cell: ({ getValue }) => (
        <span className="tabular-nums whitespace-nowrap">
          {getValue().map(formatCount).join(" → ")}
        </span>
      ),
    }),
    helper.accessor("totalLoss", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Lost clicks" align="right" />
      ),
      cell: ({ row }) =>
        `${formatCount(row.original.totalLoss)} (${row.original.lossPercent}%)`,
      meta: rightAligned,
    }),
    helper.accessor("position", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Position" align="right" />
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        return value === null ? "—" : formatPosition(value);
      },
      meta: rightAligned,
    }),
    helper.accessor("topQuery", {
      enableSorting: false,
      header: () => "Top query",
      cell: ({ getValue }) => (
        <span className="block max-w-xs truncate">{getValue() ?? "—"}</span>
      ),
    }),
    helper.accessor("wordCount", {
      header: ({ column }) => (
        <SortableHeader column={column} label="Words" align="right" />
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        return value === null ? "—" : formatCount(value);
      },
      meta: rightAligned,
    }),
  ];
}

export function exportContentDecay(
  report: ContentDecayReport,
  target: ExportTarget,
): Promise<void> {
  return runExport(
    {
      filename: `search-performance-content-decay-${report.months[0] ?? ""}-to-${report.months.at(-1) ?? ""}`,
      headers: [
        "Page",
        ...report.months.map((month) => `Clicks ${month}`),
        "Lost clicks",
        "Lost %",
        "Position",
        "Top query",
        "Word count",
      ],
      rows: report.rows.map((row) => [
        row.page,
        ...row.monthlyClicks,
        row.totalLoss,
        row.lossPercent,
        row.position,
        row.topQuery,
        row.wordCount,
      ]),
    },
    target,
  );
}

const MONTH_OPTIONS = CONTENT_DECAY_MONTHS.map((months) => ({
  value: String(months),
  label: `${months} months`,
}));

/** Toolbar select for how many months of decline to look for. */
export function ContentDecayMonthsSelect({
  months,
  onMonthsChange,
}: {
  months: number;
  onMonthsChange: (months: number) => void;
}) {
  return (
    <div className="ml-auto flex items-center">
      <Select
        items={MONTH_OPTIONS}
        value={String(months)}
        onValueChange={(value) => {
          if (value != null) onMonthsChange(Number(value));
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-36"
          aria-label="Months of decline"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ContentDecayPanel({
  projectId,
  months,
}: {
  projectId: string;
  months: number;
}) {
  const query = useQuery({
    ...contentDecayQueryOptions(projectId, months),
    placeholderData: keepPreviousData,
  });
  if (query.isPending) {
    return <SkeletonTableRows className="p-4" />;
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <QueryError
          error={query.error}
          fallback="Failed to load content decay"
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      </div>
    );
  }
  if (!query.data.connected) {
    return (
      <div className="max-w-2xl p-4">
        <GoogleConnectionCard provider="gsc" projectId={projectId} />
      </div>
    );
  }
  return <ContentDecayTable report={query.data} />;
}

function ContentDecayTable({ report }: { report: ContentDecayReport }) {
  const columns = useMemo(() => buildColumns(report.months), [report.months]);
  const table = useDataTable({
    data: report.rows,
    columns,
    withSorting: true,
    initialState: { sorting: [{ id: "totalLoss", desc: true }] },
  });
  return (
    <div className="space-y-2 p-4">
      <p className="text-sm text-muted-foreground">
        Pages that lost clicks in every month from {report.months[1] ?? ""} to{" "}
        {report.months.at(-1) ?? ""}, each compared with the month before. Pages
        under 10 clicks in {report.months[0] ?? ""} are skipped.
        {report.auditAvailable ? "" : " Run a site audit to see word counts."}
      </p>
      <DataTable
        table={table}
        empty={{
          title: "No decaying pages",
          description: "No page lost clicks in every one of these months.",
        }}
      />
    </div>
  );
}
