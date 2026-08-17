/* eslint-disable max-lines -- The scan form, history, and report state share one page workflow. */

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  deleteContentOptimization,
  getContentOptimization,
  listContentOptimizations,
  runContentOptimization,
} from "@/serverFunctions/contentOptimization";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type {
  ContentOptimizationReport,
  ContentOptimizationTerm,
} from "@/shared/content-optimization";

type Props = {
  projectId: string;
  scanId?: string;
  onScanChange: (scanId: string | undefined) => void;
};

type ScanSummary = Awaited<ReturnType<typeof listContentOptimizations>>[number];

type ScanPhase = "serp" | "pages" | "report";

const scanPhaseLabels: Record<ScanPhase, string> = {
  serp: "Reading the Google result page",
  pages: "Reading the target and competitor pages",
  report: "Building the content report",
};

const metricLabels: Array<{
  key:
    | "wordCount"
    | "h1Count"
    | "h2Count"
    | "h3Count"
    | "imageCount"
    | "internalLinkCount"
    | "entityCount"
    | "keywordVariationCount";
  label: string;
}> = [
  { key: "wordCount", label: "Words" },
  { key: "h1Count", label: "H1" },
  { key: "h2Count", label: "H2" },
  { key: "h3Count", label: "H3" },
  { key: "imageCount", label: "Images" },
  { key: "internalLinkCount", label: "Internal links" },
  { key: "entityCount", label: "Entities" },
  { key: "keywordVariationCount", label: "Keyword variations" },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClass(status: ContentOptimizationTerm["status"]): string {
  if (status === "covered") return "text-success";
  if (status === "weak") return "text-warning";
  return "text-error";
}

function StatusIcon({ status }: { status: ContentOptimizationTerm["status"] }) {
  if (status === "covered") return <CheckCircle2 className="size-4" />;
  if (status === "weak") return <AlertCircle className="size-4" />;
  return <XCircle className="size-4" />;
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="mt-1 text-xl font-semibold">{formatNumber(value)}</div>
    </div>
  );
}

function coverageLabel(status: "covered" | "weak" | "missing"): string {
  if (status === "covered") return "Covered";
  if (status === "weak") return "Found but weak";
  return "Missing";
}

function coverageClass(status: "covered" | "weak" | "missing"): string {
  if (status === "covered") return "text-success";
  if (status === "weak") return "text-warning";
  return "text-error";
}

function EntityCoverageSection({ report }: { report: ContentOptimizationReport }) {
  const coverage = report.entityCoverage;
  const entities = [
    ...coverage.naturalLanguageEntities,
    ...coverage.highlyRelatedTerms,
  ];
  const counts = {
    covered: entities.filter((entity) => entity.coverageStatus === "covered")
      .length,
    weak: entities.filter((entity) => entity.coverageStatus === "weak").length,
    missing: entities.filter((entity) => entity.coverageStatus === "missing")
      .length,
  };

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Entity and variation coverage</h2>
          <p className="text-sm text-base-content/60">
            DataForSEO compares common terms and phrases from the parsed ranking
            pages. Add them only when they fit the topic.
          </p>
        </div>
        <div className="text-right text-xs text-base-content/60">
          <div>
            Density {coverage.yourUrlRelatedEntityDensityScore.toFixed(1)} /{" "}
            {coverage.competitorRelatedEntityDensityScore.toFixed(1)}
          </div>
          <div>
            {counts.covered} covered · {counts.weak} weak · {counts.missing} missing
          </div>
        </div>
      </div>

      {entities.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          No shared entity candidates are available for this scan.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Status</th>
                <th>Importance</th>
                <th>Your frequency</th>
                <th>Competitor average</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <tr key={entity.entity}>
                  <td className="font-medium">{entity.entity}</td>
                  <td className={coverageClass(entity.coverageStatus)}>
                    {coverageLabel(entity.coverageStatus)}
                  </td>
                  <td>{entity.importance}/10</td>
                  <td>{formatNumber(entity.targetFrequency)}</td>
                  <td>{entity.competitorAverageFrequency.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {coverage.keywordVariations.length > 0 ? (
        <div className="mt-5">
          <h3 className="font-medium">Keyword variations</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {coverage.keywordVariations.map((variation) => (
              <span
                key={variation.variation}
                className={`rounded-md border border-base-300 px-2 py-1 text-xs ${coverageClass(variation.coverageStatus)}`}
              >
                {variation.variation} · {coverageLabel(variation.coverageStatus)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TopicClassificationSection({
  report,
}: {
  report: ContentOptimizationReport;
}) {
  const topic = report.topicAndClassification;
  const questions = Object.entries(topic.topicalAuthorityQuestions).filter(
    ([, values]) => values.length > 0,
  );
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Topic and page classification</h2>
          <p className="text-sm text-base-content/60">
            Page type and topic suggestions from the target page and parsed
            ranking pages.
          </p>
        </div>
        <div className="text-right text-xs text-base-content/60">
          <div>Your page: {topic.yourPage.category ?? "Not classified"}</div>
          <div>
            Confidence: {topic.yourPage.confidence === null
              ? "—"
              : `${Math.round(topic.yourPage.confidence * 100)}%`}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Ranking page types</h3>
          {topic.pageClassification.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/60">
              No ranking page was classified.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {topic.pageClassification.map((page) => (
                <div
                  key={`${page.rank}-${page.url ?? page.category}`}
                  className="flex items-center gap-2 rounded-md bg-base-200/50 p-2 text-sm"
                >
                  <span className="w-7 text-base-content/50">#{page.rank}</span>
                  <span className="flex-1">{page.category}</span>
                  <span className="text-xs text-base-content/50">
                    {Math.round(page.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">Suggested title</h3>
          <p className="mt-2 rounded-md bg-base-200/50 p-3 text-sm">
            {topic.swipeContent.suggestedTitle ?? "No title suggestion."}
          </p>
          <h3 className="mt-4 text-sm font-medium">Topic coverage</h3>
          {topic.swipeContent.topicCoverage.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/60">
              No missing topic was found.
            </p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {topic.swipeContent.topicCoverage.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {questions.length > 0 ? (
        <div className="mt-5">
          <h3 className="font-medium">Topical authority questions</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {questions.map(([group, values]) => (
              <div key={group} className="rounded-md bg-base-200/50 p-3">
                <div className="text-xs font-semibold uppercase text-base-content/60">
                  {group}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {values.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InternalLinksSection({ report }: { report: ContentOptimizationReport }) {
  const links = report.internalLinking;
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <h2 className="font-semibold">Internal links</h2>
      <p className="mt-1 text-sm text-base-content/60">{links.note}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Add links from</h3>
          {links.addInternalLinksFrom.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/60">
              No same-site ranking page was available for this recommendation.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {links.addInternalLinksFrom.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary break-all"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium">Existing links from target</h3>
          {links.existingInternalLinks.length === 0 ? (
            <p className="mt-2 text-sm text-warning">
              The target page has no parsed internal links.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {links.existingInternalLinks.slice(0, 8).map((url) => (
                <li key={url} className="truncate">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ReportView({ report }: { report: ContentOptimizationReport }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
        <div className="rounded-lg border border-base-300 bg-base-100 p-5 text-center">
          <div className="text-sm text-base-content/60">Content score</div>
          <div className="mt-2 text-5xl font-bold">{report.score}</div>
          <div className="mt-1 text-sm text-base-content/60">
            Grade {report.grade}
          </div>
        </div>
        <div className="rounded-lg border border-base-300 bg-base-100 p-5">
          <div className="text-sm text-base-content/60">Summary</div>
          <p className="mt-2 text-lg">{report.summary}</p>
          <p className="mt-3 text-sm text-base-content/60">
            {report.meta.pagesAnalyzed} page
            {report.meta.pagesAnalyzed === 1 ? "" : "s"} analyzed · scanned{" "}
            {formatDate(report.meta.scannedAt)}
          </p>
          <p className="mt-1 text-xs text-base-content/50">
            Source: {report.meta.provider} · {report.meta.analysisMethod}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-base-300 bg-base-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Page metrics</h2>
            <p className="text-sm text-base-content/60">
              Your page compared with the average of the top organic pages.
            </p>
          </div>
          <a
            href={report.target.url}
            target="_blank"
            rel="noreferrer"
            className="link link-primary inline-flex items-center gap-1 text-sm"
          >
            Open page <ArrowUpRight className="size-3" />
          </a>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-8">
          {metricLabels.map(({ key, label }) => (
            <MetricCard key={key} label={label} value={report.target[key]} />
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Your page</th>
                <th>Top page average</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Keyword frequency",
                  report.target.keywordFrequency,
                  report.benchmark.keywordFrequency,
                ],
                ["External links", report.target.externalLinkCount, null],
              ].map(([label, target, benchmark]) => (
                <tr key={String(label)}>
                  <td>{label}</td>
                  <td>{formatNumber(Number(target))}</td>
                  <td>
                    {benchmark === null ? "—" : formatNumber(Number(benchmark))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <EntityCoverageSection report={report} />

      <TopicClassificationSection report={report} />

      <InternalLinksSection report={report} />

      <section className="rounded-lg border border-base-300 bg-base-100 p-4">
        <h2 className="font-semibold">Related terms</h2>
        <p className="text-sm text-base-content/60">
          Terms found on the top organic pages. Use them when they fit the
          topic.
        </p>
        {report.terms.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/60">
            No competitor terms are available for this scan.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Status</th>
                  <th>Your frequency</th>
                  <th>Competitor average</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {report.terms.map((term) => (
                  <tr key={term.term}>
                    <td className="font-medium">{term.term}</td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 ${statusClass(term.status)}`}
                      >
                        <StatusIcon status={term.status} />
                        {term.status}
                      </span>
                    </td>
                    <td>{formatNumber(term.targetFrequency)}</td>
                    <td>{term.competitorAverageFrequency.toFixed(1)}</td>
                    <td>{Math.round(term.competitorCoverage * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-base-300 bg-base-100 p-4">
          <h2 className="font-semibold">Suggestions</h2>
          {report.suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-base-content/60">
              No major content gaps were found.
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              {report.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-base-300 bg-base-100 p-4">
          <h2 className="font-semibold">Competitors</h2>
          <div className="mt-3 space-y-2">
            {report.competitors.map((competitor) => (
              <div
                key={`${competitor.rank}-${competitor.url}`}
                className="flex items-start gap-3 rounded-md bg-base-200/50 p-3"
              >
                <span className="w-6 shrink-0 text-sm font-semibold text-base-content/60">
                  #{competitor.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={competitor.url}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary break-all text-sm"
                  >
                    {competitor.title || competitor.url}
                  </a>
                  {competitor.page ? (
                    <div className="mt-1 text-xs text-base-content/60">
                      {formatNumber(competitor.page.wordCount)} words ·{" "}
                      {formatNumber(competitor.page.h2Count)} H2 ·{" "}
                      {formatNumber(competitor.page.internalLinkCount)} internal
                      links
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-warning">
                      Content could not be parsed
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ContentOptimizationPage({
  projectId,
  scanId,
  onScanChange,
}: Props) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<ScanPhase | null>(null);

  const historyQuery = useQuery({
    queryKey: ["content-optimization", projectId, "history"],
    queryFn: () => listContentOptimizations({ data: { projectId } }),
    staleTime: 30_000,
  });
  const reportQuery = useQuery({
    queryKey: ["content-optimization", projectId, scanId],
    queryFn: () =>
      getContentOptimization({ data: { projectId, scanId: scanId! } }),
    enabled: Boolean(scanId),
    retry: false,
  });
  const runMutation = useMutation({
    mutationFn: () =>
      runContentOptimization({
        data: { projectId, url: url.trim(), keyword: keyword.trim() },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["content-optimization", projectId, "history"],
      });
      onScanChange(result.id);
      setFormError(null);
    },
    onError: (error) => setFormError(getStandardErrorMessage(error)),
  });

  useEffect(() => {
    if (!runMutation.isPending) {
      setScanPhase(null);
      return;
    }
    setScanPhase("serp");
    const pageTimer = window.setTimeout(() => setScanPhase("pages"), 1200);
    const reportTimer = window.setTimeout(
      () => setScanPhase("report"),
      4200,
    );
    return () => {
      window.clearTimeout(pageTimer);
      window.clearTimeout(reportTimer);
    };
  }, [runMutation.isPending]);
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteContentOptimization({ data: { projectId, scanId: id } }),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({
        queryKey: ["content-optimization", projectId, "history"],
      });
      if (scanId === id) onScanChange(undefined);
    },
    onError: (error) => setFormError(getStandardErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      setFormError("Enter a target keyword.");
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      setFormError("Enter a valid http or https URL.");
      return;
    }
    setFormError(null);
    runMutation.mutate();
  };

  const report = reportQuery.data?.report;
  const history = historyQuery.data ?? [];

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Content Optimization</h1>
          <p className="text-sm text-base-content/70">
            Compare one page with the top organic pages for a keyword.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-base-300 bg-base-100 p-4"
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr_auto] lg:items-end">
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">
                Target keyword
              </span>
              <input
                className="input input-bordered w-full"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="content optimization"
                maxLength={150}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm font-medium">
                Page URL
              </span>
              <input
                className="input input-bordered w-full"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/page"
                type="url"
                maxLength={2048}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileSearch className="size-4" />
              )}
              {runMutation.isPending ? "Scanning…" : "Scan page"}
            </button>
          </div>
          <p className="mt-3 text-xs text-base-content/60">
            The scan uses the project market and consumes DataForSEO credits for
            one SERP request and page parsing requests.
          </p>
          {scanPhase ? (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
              <LoaderCircle className="size-4 animate-spin" />
              <span>{scanPhaseLabels[scanPhase]}…</span>
            </div>
          ) : null}
          {formError ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md bg-error/10 p-3 text-sm text-error"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}
        </form>

        {history.length > 0 ? (
          <section className="rounded-lg border border-base-300 bg-base-100 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Recent scans</h2>
                <p className="text-sm text-base-content/60">
                  Select a stored report.
                </p>
              </div>
              {historyQuery.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {history.map((scan) => (
                <ScanHistoryCard
                  key={scan.id}
                  scan={scan}
                  active={scan.id === scanId}
                  onSelect={() => onScanChange(scan.id)}
                  onDelete={() => deleteMutation.mutate(scan.id)}
                  deleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables === scan.id
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {reportQuery.isError ? (
          <div
            role="alert"
            className="rounded-md bg-error/10 p-3 text-sm text-error"
          >
            {getStandardErrorMessage(reportQuery.error)}
          </div>
        ) : null}
        {reportQuery.isPending ? (
          <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-6 text-sm text-base-content/60">
            <LoaderCircle className="size-4 animate-spin" /> Loading report…
          </div>
        ) : report ? (
          <ReportView report={report} />
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-10 text-center">
            <FileSearch className="mx-auto size-8 text-base-content/40" />
            <h2 className="mt-3 font-semibold">No scans yet</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Enter a keyword and page URL to create the first report.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScanHistoryCard({
  scan,
  active,
  onSelect,
  onDelete,
  deleting,
}: {
  scan: ScanSummary;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${active ? "border-primary bg-primary/5" : "border-base-300"}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{scan.keyword}</span>
          <span className="text-sm font-semibold">{scan.score}/100</span>
        </div>
        <div className="mt-1 truncate text-xs text-base-content/60">
          {scan.url}
        </div>
        <div className="mt-2 text-xs text-base-content/60">
          Grade {scan.grade} · {formatDate(scan.createdAt)}
        </div>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs mt-2 gap-1 text-error"
        onClick={onDelete}
        disabled={deleting}
      >
        {deleting ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <Trash2 className="size-3" />
        )}
        Delete
      </button>
    </div>
  );
}
