import { useMemo } from "react";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  formatCount,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import {
  runExport,
  type ExportTarget,
} from "@/client/features/search-performance/SearchPerformanceParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getContentDecayReport } from "@/serverFunctions/searchPerformance";

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
): void {
  runExport(
    {
      filename: `search-performance-content-decay-${report.months[0] ?? ""}-to-${report.months.at(-1) ?? ""}.csv`,
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
  if (query.isError) {
    return (
      <div className="p-4">
        <div className="alert alert-error">
          <span className="text-sm">
            {getStandardErrorMessage(query.error)}
          </span>
        </div>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!query.data.connected) {
    return (
      <p className="p-6 text-sm text-base-content/60">
        Search Console is not connected.
      </p>
    );
  }
  return <ContentDecayTable report={query.data} />;
}

function ContentDecayTable({ report }: { report: ContentDecayReport }) {
  const columns = useMemo(() => buildColumns(report.months), [report.months]);
  const table = useAppTable({
    data: report.rows,
    columns,
    withSorting: true,
    initialState: { sorting: [{ id: "totalLoss", desc: true }] },
  });
  return (
    <div className="space-y-2 p-4">
      <p className="text-sm text-base-content/70">
        Pages that lost clicks in every month from {report.months[1] ?? ""} to{" "}
        {report.months.at(-1) ?? ""}, each compared with the month before. Pages
        under 10 clicks in {report.months[0] ?? ""} are skipped.
        {report.auditAvailable ? "" : " Run a site audit to see word counts."}
      </p>
      <AppDataTable
        table={table}
        className="table table-zebra table-sm"
        wrapperClassName="overflow-x-auto"
        empty={
          <p className="p-6 text-sm text-base-content/60">
            No page lost clicks in every one of these months.
          </p>
        }
      />
    </div>
  );
}
