import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import {
  contentOptimizationReportSchema,
  type ContentOptimizationReport,
} from "@/shared/content-optimization";
import { ContentScanRepository } from "../repositories/ContentScanRepository";
import { canonicalizeContentOptimizationUrl } from "./contentOptimizationUrl";
import { buildContentOptimizationReport } from "./contentOptimizationReport";

export type ContentOptimizationRunInput = {
  projectId: string;
  url: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
};

export type ContentOptimizationScan = {
  id: string;
  createdAt: string;
  status: "completed";
  report: ContentOptimizationReport;
};

async function run(
  input: ContentOptimizationRunInput,
  billingCustomer: BillingCustomerContext,
): Promise<ContentOptimizationScan> {
  const url = canonicalizeContentOptimizationUrl(input.url);
  const source = await createDataforseoClient(
    billingCustomer,
  ).contentOptimization.scan({
    url,
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    creditFeature: "content_optimization",
  });
  const report = buildContentOptimizationReport(source, {
    url,
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    scannedAt: new Date().toISOString(),
  });
  const row = await ContentScanRepository.insert({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    url,
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    score: report.score,
    grade: report.grade,
    report: JSON.stringify(report),
  });

  return { id: row.id, createdAt: row.createdAt, status: "completed", report };
}

async function list(projectId: string) {
  return ContentScanRepository.listForProject(projectId);
}

async function get(
  projectId: string,
  id: string,
): Promise<ContentOptimizationScan> {
  const row = await ContentScanRepository.getById(projectId, id);
  if (!row) throw new AppError("NOT_FOUND");

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.report);
  } catch {
    throw new AppError("INTERNAL_ERROR", "Stored content report is invalid");
  }
  const report = contentOptimizationReportSchema.safeParse(parsed);
  if (!report.success) {
    throw new AppError("INTERNAL_ERROR", "Stored content report is invalid");
  }
  return {
    id: row.id,
    createdAt: row.createdAt,
    status: "completed",
    report: report.data,
  };
}

async function remove(projectId: string, id: string): Promise<void> {
  const deleted = await ContentScanRepository.deleteById(projectId, id);
  if (!deleted) throw new AppError("NOT_FOUND");
}

export const ContentOptimizationService = {
  run,
  list,
  get,
  remove,
};
