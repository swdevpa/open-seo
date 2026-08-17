import { z } from "zod";

export const CONTENT_OPTIMIZATION_TOP_PAGES = 5;

const pageMetricsSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  headings: z.array(z.string()),
  wordCount: z.number().int().nonnegative(),
  h1Count: z.number().int().nonnegative(),
  h2Count: z.number().int().nonnegative(),
  h3Count: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
  internalLinkCount: z.number().int().nonnegative(),
  externalLinkCount: z.number().int().nonnegative(),
  keywordFrequency: z.number().int().nonnegative(),
  entityCount: z.number().int().nonnegative().default(0),
  keywordVariationCount: z.number().int().nonnegative().default(0),
});

const benchmarkSchema = z.object({
  wordCount: z.number().int().nonnegative(),
  h1Count: z.number().nonnegative(),
  h2Count: z.number().nonnegative(),
  h3Count: z.number().nonnegative(),
  imageCount: z.number().nonnegative(),
  internalLinkCount: z.number().nonnegative(),
  keywordFrequency: z.number().nonnegative(),
  entityCount: z.number().nonnegative().default(0),
  keywordVariationCount: z.number().nonnegative().default(0),
});

const termSchema = z.object({
  term: z.string(),
  importance: z.number().nonnegative(),
  targetFrequency: z.number().nonnegative(),
  competitorAverageFrequency: z.number().nonnegative(),
  competitorCoverage: z.number().min(0).max(1),
  status: z.enum(["covered", "weak", "missing"]),
});

const competitorSchema = z.object({
  rank: z.number().int().positive(),
  url: z.string().url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  page: pageMetricsSchema.nullable(),
});

const coverageStatusSchema = z.enum(["covered", "weak", "missing"]);

const entitySchema = z.object({
  entity: z.string(),
  importance: z.number().int().min(1).max(10),
  targetFrequency: z.number().nonnegative(),
  competitorAverageFrequency: z.number().nonnegative(),
  competitorCoverage: z.number().min(0).max(1),
  coverageStatus: coverageStatusSchema,
});

const relatedEntitySchema = z.object({
  entity: z.string(),
  importance: z.number().int().min(1).max(10),
  targetFrequency: z.number().nonnegative(),
  competitorAverageFrequency: z.number().nonnegative(),
  competitorCoverage: z.number().min(0).max(1),
  coverageStatus: coverageStatusSchema,
});

const keywordVariationSchema = z.object({
  variation: z.string(),
  targetFrequency: z.number().nonnegative(),
  competitorAverageFrequency: z.number().nonnegative(),
  competitorCoverage: z.number().min(0).max(1),
  coverageStatus: coverageStatusSchema,
});

const entityCoverageSchema = z.object({
  yourUrlRelatedEntityDensityScore: z.number().nonnegative(),
  competitorRelatedEntityDensityScore: z.number().nonnegative(),
  naturalLanguageEntities: z.array(entitySchema),
  highlyRelatedTerms: z.array(relatedEntitySchema),
  keywordVariations: z.array(keywordVariationSchema),
});

const pageClassificationSchema = z.object({
  rank: z.number().int().positive(),
  category: z.string(),
  url: z.string().url().nullable(),
  confidence: z.number().min(0).max(1),
});

const topicAndClassificationSchema = z.object({
  pageClassification: z.array(pageClassificationSchema),
  yourPage: z.object({
    category: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  }),
  swipeContent: z.object({
    suggestedTitle: z.string().nullable(),
    topicCoverage: z.array(z.string()),
  }),
  topicalAuthorityQuestions: z.object({
    definition: z.array(z.string()),
    process: z.array(z.string()),
    selection: z.array(z.string()),
    comparison: z.array(z.string()),
  }),
});

const internalLinkingSchema = z.object({
  addInternalLinksFrom: z.array(z.string().url()),
  toYourUrl: z.string().url().nullable(),
  existingInternalLinks: z.array(z.string().url()),
  note: z.string(),
});

const competitorTermCoverageSchema = z.object({
  terms: z.array(
    z.object({
      keyword: z.string(),
      importance: z.number().nonnegative(),
      yourUrlCount: z.number().nonnegative(),
      competitorCounts: z.array(z.number().nonnegative()),
    }),
  ),
});

const emptyEntityCoverage = {
  yourUrlRelatedEntityDensityScore: 0,
  competitorRelatedEntityDensityScore: 0,
  naturalLanguageEntities: [],
  highlyRelatedTerms: [],
  keywordVariations: [],
};

const emptyTopicAndClassification = {
  pageClassification: [],
  yourPage: { category: null, confidence: null },
  swipeContent: { suggestedTitle: null, topicCoverage: [] },
  topicalAuthorityQuestions: {
    definition: [],
    process: [],
    selection: [],
    comparison: [],
  },
};

const emptyInternalLinking = {
  addInternalLinksFrom: [],
  toYourUrl: null,
  existingInternalLinks: [],
  note: "No internal link crawl was available for this report.",
};

export const contentOptimizationReportSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  meta: z.object({
    url: z.string().url(),
    keyword: z.string(),
    locationCode: z.number().int().positive(),
    languageCode: z.string(),
    scannedAt: z.string(),
    pagesAnalyzed: z.number().int().nonnegative(),
    provider: z.string().default("dataforseo"),
    analysisMethod: z.string().default("dataforseo-content-parsing"),
  }),
  score: z.number().int().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "E"]),
  summary: z.string(),
  target: pageMetricsSchema,
  benchmark: benchmarkSchema,
  terms: z.array(termSchema),
  competitors: z.array(competitorSchema),
  suggestions: z.array(z.string()),
  focusAreas: z.array(z.string()).default([]),
  entityCoverage: entityCoverageSchema.default(emptyEntityCoverage),
  topicAndClassification: topicAndClassificationSchema.default(
    emptyTopicAndClassification,
  ),
  internalLinking: internalLinkingSchema.default(emptyInternalLinking),
  competitorTermCoverage: competitorTermCoverageSchema.default({ terms: [] }),
});

export type ContentOptimizationPageMetrics = z.infer<typeof pageMetricsSchema>;
export type ContentOptimizationBenchmark = z.infer<typeof benchmarkSchema>;
export type ContentOptimizationTerm = z.infer<typeof termSchema>;
export type ContentOptimizationCompetitor = z.infer<typeof competitorSchema>;
export type ContentOptimizationEntity = z.infer<typeof entitySchema>;
export type ContentOptimizationKeywordVariation = z.infer<
  typeof keywordVariationSchema
>;
export type ContentOptimizationPageClassification = z.infer<
  typeof pageClassificationSchema
>;
export type ContentOptimizationReport = z.infer<
  typeof contentOptimizationReportSchema
>;
