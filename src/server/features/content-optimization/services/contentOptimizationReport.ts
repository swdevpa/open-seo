/* eslint-disable max-lines -- The deterministic report keeps all scoring and section rules together. */

import {
  type ContentOptimizationBenchmark,
  type ContentOptimizationPageMetrics,
  type ContentOptimizationReport,
  type ContentOptimizationTerm,
} from "@/shared/content-optimization";
import type {
  ContentOptimizationPageSource,
  ContentOptimizationSource,
} from "@/server/lib/dataforseo/content-optimization";

type ReportInput = {
  url: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  scannedAt: string;
};

type CandidateCounts = {
  total: number;
  pages: number;
  counts: number[];
  isPhrase: boolean;
};

type CoverageStats = {
  targetEntityCount: number;
  competitorEntityCounts: number[];
  targetVariationCount: number;
  competitorVariationCounts: number[];
};

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pageMetrics(
  page: ContentOptimizationPageSource,
  entityCount = 0,
  keywordVariationCount = 0,
): ContentOptimizationPageMetrics {
  return {
    url: page.url,
    title: page.title,
    description: page.description,
    headings: page.headings,
    wordCount: page.wordCount,
    h1Count: page.h1Count,
    h2Count: page.h2Count,
    h3Count: page.h3Count,
    imageCount: page.imageCount,
    internalLinkCount: page.internalLinkCount,
    externalLinkCount: page.externalLinkCount,
    keywordFrequency: page.keywordFrequency,
    entityCount,
    keywordVariationCount,
  };
}

function average(
  pages: ContentOptimizationPageSource[],
  field: keyof Pick<
    ContentOptimizationPageMetrics,
    | "wordCount"
    | "h1Count"
    | "h2Count"
    | "h3Count"
    | "imageCount"
    | "internalLinkCount"
    | "keywordFrequency"
  >,
): number {
  if (pages.length === 0) return 0;
  return round(
    pages.reduce((total, page) => total + page[field], 0) / pages.length,
  );
}

function averageNumbers(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildBenchmark(
  target: ContentOptimizationPageSource,
  competitors: ContentOptimizationPageSource[],
  stats: CoverageStats,
): ContentOptimizationBenchmark {
  const pages = competitors.length > 0 ? competitors : [target];
  const entityCounts =
    competitors.length > 0
      ? stats.competitorEntityCounts
      : [stats.targetEntityCount];
  const variationCounts =
    competitors.length > 0
      ? stats.competitorVariationCounts
      : [stats.targetVariationCount];

  return {
    wordCount: Math.round(average(pages, "wordCount")),
    h1Count: average(pages, "h1Count"),
    h2Count: average(pages, "h2Count"),
    h3Count: average(pages, "h3Count"),
    imageCount: average(pages, "imageCount"),
    internalLinkCount: average(pages, "internalLinkCount"),
    keywordFrequency: average(pages, "keywordFrequency"),
    entityCount: round(averageNumbers(entityCounts)),
    keywordVariationCount: round(averageNumbers(variationCounts)),
  };
}

function keywordTokens(keyword: string): Set<string> {
  return new Set(keyword.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

function normalizePhrase(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function coverageStatus(
  targetFrequency: number,
  competitorAverageFrequency: number,
): ContentOptimizationTerm["status"] {
  if (targetFrequency === 0) return "missing";
  if (
    competitorAverageFrequency > 0 &&
    targetFrequency < competitorAverageFrequency * 0.5
  ) {
    return "weak";
  }
  return "covered";
}

function addCandidate(
  candidates: Map<string, CandidateCounts>,
  value: string,
  count: number,
  pageIndex: number,
  isPhrase: boolean,
): void {
  const normalized = normalizePhrase(value);
  if (!normalized || count <= 0) return;
  const current = candidates.get(normalized) ?? {
    total: 0,
    pages: 0,
    counts: [],
    isPhrase,
  };
  current.total += count;
  current.pages += count > 0 ? 1 : 0;
  current.counts[pageIndex] = count;
  current.isPhrase ||= isPhrase;
  candidates.set(normalized, current);
}

function buildCandidatePool(
  competitors: ContentOptimizationPageSource[],
  keyword: string,
): Map<string, CandidateCounts> {
  const excluded = keywordTokens(keyword);
  const candidates = new Map<string, CandidateCounts>();

  for (const [pageIndex, page] of competitors.entries()) {
    for (const [term, count] of Object.entries(page.termCounts)) {
      if (!excluded.has(term)) {
        addCandidate(candidates, term, count, pageIndex, false);
      }
    }
    for (const [phrase, count] of Object.entries(page.phraseCounts ?? {})) {
      if (normalizePhrase(phrase) !== normalizePhrase(keyword)) {
        addCandidate(candidates, phrase, count, pageIndex, true);
      }
    }
  }

  return candidates;
}

function candidateImportance(
  competitorCoverage: number,
  competitorAverageFrequency: number,
): number {
  return Math.max(
    1,
    Math.min(
      10,
      Math.round(
        competitorCoverage * 7 + Math.min(3, competitorAverageFrequency),
      ),
    ),
  );
}

function buildTerms(
  target: ContentOptimizationPageSource,
  competitors: ContentOptimizationPageSource[],
  keyword: string,
): ContentOptimizationTerm[] {
  if (competitors.length === 0) return [];

  const excluded = keywordTokens(keyword);
  const totals = new Map<string, { total: number; pages: number }>();

  for (const page of competitors) {
    for (const [term, count] of Object.entries(page.termCounts)) {
      if (excluded.has(term)) continue;
      const current = totals.get(term) ?? { total: 0, pages: 0 };
      current.total += count;
      current.pages += count > 0 ? 1 : 0;
      totals.set(term, current);
    }
  }

  return [...totals.entries()]
    .map(([term, counts]) => {
      const competitorAverageFrequency = round(
        counts.total / competitors.length,
      );
      const competitorCoverage = round(counts.pages / competitors.length, 2);
      const targetFrequency = target.termCounts[term] ?? 0;
      const importance = round(
        competitorCoverage * Math.max(1, competitorAverageFrequency),
        2,
      );

      return {
        term,
        importance,
        targetFrequency,
        competitorAverageFrequency,
        competitorCoverage,
        status: coverageStatus(
          targetFrequency,
          competitorAverageFrequency,
        ),
      };
    })
    .filter((term) => term.competitorCoverage >= 0.4 || term.importance >= 1)
    .toSorted(
      (left, right) =>
        right.importance - left.importance ||
        right.competitorCoverage - left.competitorCoverage ||
        left.term.localeCompare(right.term),
    )
    .slice(0, 20);
}

function buildEntityCoverage(
  target: ContentOptimizationPageSource,
  competitors: ContentOptimizationPageSource[],
  keyword: string,
): {
  entityCoverage: ContentOptimizationReport["entityCoverage"];
  stats: CoverageStats;
} {
  if (competitors.length === 0) {
    return {
      entityCoverage: {
        yourUrlRelatedEntityDensityScore: 0,
        competitorRelatedEntityDensityScore: 0,
        naturalLanguageEntities: [],
        highlyRelatedTerms: [],
        keywordVariations: [],
      },
      stats: {
        targetEntityCount: 0,
        competitorEntityCounts: [],
        targetVariationCount: 0,
        competitorVariationCounts: [],
      },
    };
  }

  const pool = buildCandidatePool(competitors, keyword);
  const candidates = [...pool.entries()]
    .map(([entity, counts]) => {
      const competitorAverageFrequency = round(
        counts.total / competitors.length,
      );
      const competitorCoverage = round(counts.pages / competitors.length, 2);
      const targetFrequency = counts.isPhrase
        ? target.phraseCounts?.[entity] ?? 0
        : target.termCounts[entity] ?? 0;
      const importance = candidateImportance(
        competitorCoverage,
        competitorAverageFrequency,
      );
      return {
        entity,
        importance,
        targetFrequency,
        competitorAverageFrequency,
        competitorCoverage,
        coverageStatus: coverageStatus(
          targetFrequency,
          competitorAverageFrequency,
        ),
        isPhrase: counts.isPhrase,
      };
    })
    .filter((candidate) => candidate.competitorCoverage >= 0.4)
    .toSorted(
      (left, right) =>
        right.importance - left.importance ||
        Number(right.isPhrase) - Number(left.isPhrase) ||
        right.competitorCoverage - left.competitorCoverage ||
        left.entity.localeCompare(right.entity),
    );

  const naturalLanguageEntities = candidates
    .filter((candidate) => candidate.isPhrase || candidate.importance >= 4)
    .slice(0, 20)
    .map(({ isPhrase: _isPhrase, ...candidate }) => candidate);
  const namedEntities = new Set(
    naturalLanguageEntities.map((candidate) => candidate.entity),
  );
  const highlyRelatedTerms = candidates
    .filter((candidate) => !namedEntities.has(candidate.entity))
    .slice(0, 10)
    .map(({ isPhrase: _isPhrase, ...candidate }) => candidate);

  const variationCandidates = candidates
    .filter((candidate) => {
      if (!candidate.isPhrase) return false;
      const phraseTokens = new Set(candidate.entity.split(" "));
      const sharesKeywordToken = [...keywordTokens(keyword)].some((token) =>
        phraseTokens.has(token),
      );
      return sharesKeywordToken || candidate.competitorCoverage >= 0.6;
    })
    .slice(0, 12);
  const keywordVariations = variationCandidates.map((candidate) => ({
    variation: candidate.entity,
    targetFrequency: candidate.targetFrequency,
    competitorAverageFrequency: candidate.competitorAverageFrequency,
    competitorCoverage: candidate.competitorCoverage,
    coverageStatus: candidate.coverageStatus,
  }));

  const entityMentions = (
    page: ContentOptimizationPageSource,
    entities: typeof naturalLanguageEntities,
  ) =>
    entities.reduce(
      (total, entity) =>
        total +
        (pool.get(entity.entity)?.isPhrase
          ? page.phraseCounts?.[entity.entity] ?? 0
          : page.termCounts[entity.entity] ?? 0),
      0,
    );
  const entityCount = (
    page: ContentOptimizationPageSource,
    entities: typeof naturalLanguageEntities,
  ) =>
    entities.filter((entity) =>
      pool.get(entity.entity)?.isPhrase
        ? (page.phraseCounts?.[entity.entity] ?? 0) > 0
        : (page.termCounts[entity.entity] ?? 0) > 0,
    ).length;
  const variationCount = (page: ContentOptimizationPageSource) =>
    keywordVariations.filter(
      (variation) => (page.phraseCounts?.[variation.variation] ?? 0) > 0,
    ).length;

  const targetDensity =
    target.wordCount > 0
      ? round(
          (entityMentions(target, naturalLanguageEntities) /
            target.wordCount) *
            1000,
        )
      : 0;
  const competitorDensity = round(
    averageNumbers(
      competitors.map((page) =>
        page.wordCount > 0
          ? (entityMentions(page, naturalLanguageEntities) / page.wordCount) *
            1000
          : 0,
      ),
    ),
  );

  return {
    entityCoverage: {
      yourUrlRelatedEntityDensityScore: targetDensity,
      competitorRelatedEntityDensityScore: competitorDensity,
      naturalLanguageEntities,
      highlyRelatedTerms,
      keywordVariations,
    },
    stats: {
      targetEntityCount: entityCount(target, naturalLanguageEntities),
      competitorEntityCounts: competitors.map((page) =>
        entityCount(page, naturalLanguageEntities),
      ),
      targetVariationCount: variationCount(target),
      competitorVariationCounts: competitors.map(variationCount),
    },
  };
}

function classifyPage(
  page: ContentOptimizationPageSource,
  keyword: string,
): { category: string; confidence: number } {
  const content = `${page.url} ${page.title ?? ""} ${page.headings.join(" ")} ${page.text.slice(0, 5000)}`.toLocaleLowerCase();
  const rules: Array<{
    category: string;
    pattern: RegExp;
    confidence: number;
  }> = [
    {
      category: "Comparison",
      pattern: /\b(vs|versus|comparison|alternative|alternatives)\b/i,
      confidence: 0.9,
    },
    {
      category: "List",
      pattern: /\b(best|top|ideas|examples|ways|tools|list)\b/i,
      confidence: 0.86,
    },
    {
      category: "FAQ",
      pattern: /\b(faq|questions|frequently asked)\b|\?/i,
      confidence: 0.84,
    },
    {
      category: "Transactional",
      pattern: /\b(pricing|price|buy|order|product|service|services|demo)\b/i,
      confidence: 0.82,
    },
    {
      category: "Guide",
      pattern: /\b(guide|how to|tutorial|learn|complete|step by step)\b/i,
      confidence: 0.8,
    },
  ];

  const matched = rules.find((rule) => rule.pattern.test(content));
  if (matched) return matched;
  if (content.includes(keyword.toLocaleLowerCase())) {
    return { category: "Informational", confidence: 0.58 };
  }
  return { category: "Informational", confidence: 0.45 };
}

function dominantCategory(
  classifications: ContentOptimizationReport["topicAndClassification"]["pageClassification"],
): string | null {
  const counts = new Map<string, number>();
  for (const classification of classifications) {
    counts.set(
      classification.category,
      (counts.get(classification.category) ?? 0) + 1,
    );
  }
  return (
    [...counts.entries()].toSorted((left, right) => right[1] - left[1])[0]?.[0] ??
    null
  );
}

function suggestedTitle(keyword: string, category: string | null): string | null {
  if (!keyword.trim()) return null;
  const templates: Record<string, string> = {
    Comparison: `${keyword}: Comparison and Alternatives`,
    List: `Best ${keyword}: Practical Options and Tips`,
    FAQ: `${keyword}: Frequently Asked Questions`,
    Transactional: `${keyword}: Services, Pricing, and Options`,
    Guide: `${keyword}: Complete Guide`,
    Informational: `${keyword}: Practical Guide`,
  };
  const title =
    templates[category ?? "Informational"] ?? templates.Informational;
  return title.length <= 65 ? title : `${title.slice(0, 62).trimEnd()}...`;
}

function extractQuestions(text: string): string[] {
  return [...text.matchAll(/[^.!?\n]{20,160}\?/g)]
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .filter((question) => question.length <= 160);
}

function buildQuestions(
  keyword: string,
  competitors: ContentOptimizationPageSource[],
): ContentOptimizationReport["topicAndClassification"]["topicalAuthorityQuestions"] {
  const cleanKeyword = keyword.trim().replace(/[?.!]+$/, "");
  const extracted = competitors.flatMap((page) => extractQuestions(page.text));
  const uniqueExtracted = [...new Set(extracted)];
  return {
    definition: [
      `What is ${cleanKeyword}?`,
      ...uniqueExtracted
        .filter((question) => /\bwhat is|what are\b/i.test(question))
        .slice(0, 2),
    ].slice(0, 3),
    process: [
      `How does ${cleanKeyword} work?`,
      `How do you use ${cleanKeyword}?`,
      ...uniqueExtracted
        .filter((question) => /\bhow\b/i.test(question))
        .slice(0, 1),
    ].slice(0, 3),
    selection: [
      `What should you consider when choosing ${cleanKeyword}?`,
      ...uniqueExtracted
        .filter((question) => /\bchoose|choosing|consider\b/i.test(question))
        .slice(0, 2),
    ].slice(0, 3),
    comparison: [
      `What are the best alternatives to ${cleanKeyword}?`,
      ...uniqueExtracted
        .filter((question) =>
          /\bcompare|alternative|versus|difference\b/i.test(question),
        )
        .slice(0, 2),
    ].slice(0, 3),
  };
}

function buildTopicAndClassification(
  target: ContentOptimizationPageSource,
  competitors: Array<{
    rank: number;
    url: string;
    page: ContentOptimizationPageSource | null;
  }>,
  keyword: string,
  terms: ContentOptimizationTerm[],
): ContentOptimizationReport["topicAndClassification"] {
  const targetClassification = classifyPage(target, keyword);
  const pageClassification = competitors.flatMap((competitor) => {
    if (!competitor.page) return [];
    const classification = classifyPage(competitor.page, keyword);
    return [
      {
        rank: competitor.rank,
        category: classification.category,
        url: competitor.url,
        confidence: classification.confidence,
      },
    ];
  });
  const dominant = dominantCategory(pageClassification);
  const topicCoverage = terms
    .filter((term) => term.status !== "covered")
    .slice(0, 8)
    .map((term) => term.term);

  return {
    pageClassification,
    yourPage: {
      category: targetClassification.category,
      confidence: targetClassification.confidence,
    },
    swipeContent: {
      suggestedTitle: suggestedTitle(keyword, dominant),
      topicCoverage,
    },
    topicalAuthorityQuestions: buildQuestions(
      keyword,
      competitors.flatMap((competitor) =>
        competitor.page ? [competitor.page] : [],
      ),
    ),
  };
}

function sameHost(left: string, right: string): boolean {
  try {
    return new URL(left).hostname === new URL(right).hostname;
  } catch {
    return false;
  }
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString().toLocaleLowerCase();
  } catch {
    return value.toLocaleLowerCase();
  }
}

function buildInternalLinking(
  target: ContentOptimizationPageSource,
  competitors: Array<{
    rank: number;
    url: string;
    page: ContentOptimizationPageSource | null;
  }>,
): ContentOptimizationReport["internalLinking"] {
  const targetUrl = normalizedUrl(target.url);
  const sameSitePages = competitors.filter(
    (competitor) => competitor.page && sameHost(competitor.url, target.url),
  );
  const addInternalLinksFrom = sameSitePages
    .filter(
      (competitor) =>
        !(competitor.page?.internalLinkUrls ?? []).some(
          (url) => normalizedUrl(url) === targetUrl,
        ),
    )
    .map((competitor) => competitor.url);
  const existingInternalLinks = (target.internalLinkUrls ?? []).slice(0, 20);

  return {
    addInternalLinksFrom,
    toYourUrl: addInternalLinksFrom.length > 0 ? target.url : null,
    existingInternalLinks,
    note:
      addInternalLinksFrom.length > 0
        ? "These same-site pages rank for the keyword but do not link to the target URL."
        : "DataForSEO only parsed the target page and ranking pages. A wider site crawl may find more internal link opportunities.",
  };
}

function buildScore(
  target: ContentOptimizationPageSource,
  benchmark: ContentOptimizationBenchmark,
  terms: ContentOptimizationTerm[],
  entityCoverage: ContentOptimizationReport["entityCoverage"],
): number {
  let score = 100;

  if (benchmark.wordCount > 0) {
    const ratio = target.wordCount / benchmark.wordCount;
    if (ratio < 0.5) score -= 20;
    else if (ratio < 0.8) score -= 10;
  }
  if (target.keywordFrequency === 0) score -= 20;
  if (target.h1Count !== 1) score -= 10;
  if (benchmark.h2Count > 0 && target.h2Count < benchmark.h2Count * 0.5) {
    score -= 10;
  }
  if (benchmark.internalLinkCount > 0 && target.internalLinkCount === 0) {
    score -= 5;
  }

  const weakTerms = terms.filter((term) => term.status !== "covered").length;
  score -= Math.min(20, weakTerms * 2);
  const entityGaps = entityCoverage.naturalLanguageEntities.filter(
    (entity) => entity.coverageStatus !== "covered",
  ).length;
  score -= Math.min(10, entityGaps);
  const variationGaps = entityCoverage.keywordVariations.filter(
    (variation) => variation.coverageStatus !== "covered",
  ).length;
  score -= Math.min(5, variationGaps);

  return Math.max(0, Math.min(100, score));
}

function gradeForScore(score: number): ContentOptimizationReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "E";
}

type SuggestionInput = {
  target: ContentOptimizationPageSource;
  benchmark: ContentOptimizationBenchmark;
  terms: ContentOptimizationTerm[];
  entityCoverage: ContentOptimizationReport["entityCoverage"];
  topicAndClassification: ContentOptimizationReport["topicAndClassification"];
  internalLinking: ContentOptimizationReport["internalLinking"];
};

function buildSuggestions(input: SuggestionInput): string[] {
  const {
    target,
    benchmark,
    terms,
    entityCoverage,
    topicAndClassification,
    internalLinking,
  } = input;
  const suggestions: string[] = [];
  if (target.keywordFrequency === 0) {
    suggestions.push(
      "Use the target keyword in the page text and main heading.",
    );
  }
  if (target.h1Count === 0) {
    suggestions.push("Add one clear H1 heading to the page.");
  } else if (target.h1Count > 1) {
    suggestions.push("Keep one H1 heading and use H2 headings for subtopics.");
  }
  if (benchmark.wordCount > target.wordCount) {
    suggestions.push(
      `Add about ${Math.max(1, benchmark.wordCount - target.wordCount)} words to match the top pages.`,
    );
  }
  const missingTerms = terms
    .filter((term) => term.status === "missing")
    .slice(0, 3)
    .map((term) => term.term);
  if (missingTerms.length > 0) {
    suggestions.push(`Cover these related terms: ${missingTerms.join(", ")}.`);
  }
  const missingEntities = entityCoverage.naturalLanguageEntities
    .filter((entity) => entity.coverageStatus === "missing")
    .slice(0, 3)
    .map((entity) => entity.entity);
  if (missingEntities.length > 0) {
    suggestions.push(
      `Add natural context for these entities: ${missingEntities.join(", ")}.`,
    );
  }
  const missingVariations = entityCoverage.keywordVariations
    .filter((variation) => variation.coverageStatus === "missing")
    .slice(0, 3)
    .map((variation) => variation.variation);
  if (missingVariations.length > 0) {
    suggestions.push(
      `Cover these keyword variations where relevant: ${missingVariations.join(", ")}.`,
    );
  }
  const rankingCategory = dominantCategory(
    topicAndClassification.pageClassification,
  );
  if (
    rankingCategory &&
    topicAndClassification.yourPage.category !== rankingCategory
  ) {
    suggestions.push(
      `The page type differs from most ranking pages. Review the ${rankingCategory.toLocaleLowerCase()} format.`,
    );
  }
  if (internalLinking.addInternalLinksFrom.length > 0) {
    suggestions.push(
      `Add a link to this page from ${internalLinking.addInternalLinksFrom.length} related same-site ranking page${internalLinking.addInternalLinksFrom.length === 1 ? "" : "s"}.`,
    );
  } else if (benchmark.internalLinkCount > 0 && target.internalLinkCount === 0) {
    suggestions.push("Add internal links to related pages.");
  }
  return suggestions.slice(0, 8);
}

function buildCompetitorTermCoverage(
  terms: ContentOptimizationTerm[],
  target: ContentOptimizationPageSource,
  competitors: ContentOptimizationPageSource[],
) {
  return {
    terms: terms.map((term) => ({
      keyword: term.term,
      importance: term.importance,
      yourUrlCount: target.termCounts[term.term] ?? 0,
      competitorCounts: competitors.map(
        (competitor) => competitor.termCounts[term.term] ?? 0,
      ),
    })),
  };
}

export function buildContentOptimizationReport(
  source: ContentOptimizationSource,
  input: ReportInput,
): ContentOptimizationReport {
  const competitorPages = source.competitors
    .filter(
      (
        competitor,
      ): competitor is typeof competitor & {
        page: ContentOptimizationPageSource;
      } => competitor.page !== null,
    )
    .map((competitor) => competitor.page);
  const terms = buildTerms(source.target, competitorPages, input.keyword);
  const { entityCoverage, stats } = buildEntityCoverage(
    source.target,
    competitorPages,
    input.keyword,
  );
  const benchmark = buildBenchmark(source.target, competitorPages, stats);
  const topicAndClassification = buildTopicAndClassification(
    source.target,
    source.competitors,
    input.keyword,
    terms,
  );
  const internalLinking = buildInternalLinking(
    source.target,
    source.competitors,
  );
  const suggestions = buildSuggestions({
    target: source.target,
    benchmark,
    terms,
    entityCoverage,
    topicAndClassification,
    internalLinking,
  });
  const score = buildScore(
    source.target,
    benchmark,
    terms,
    entityCoverage,
  );
  const grade = gradeForScore(score);
  const pagesAnalyzed = 1 + competitorPages.length;
  const summary =
    competitorPages.length > 0
      ? `Grade ${grade}. The page scores ${score}/100 against ${competitorPages.length} top organic pages. DataForSEO compared structure, entities, keyword variations, page type, and links.`
      : `Grade ${grade}. The page scores ${score}/100. No competitor page could be parsed.`;
  const focusAreas = suggestions.slice(0, 5);
  const entityCountFor = (page: ContentOptimizationPageSource) =>
    entityCoverage.naturalLanguageEntities.filter((entity) =>
      entity.entity.includes(" ")
        ? (page.phraseCounts?.[entity.entity] ?? 0) > 0
        : (page.termCounts[entity.entity] ?? 0) > 0,
    ).length;

  return {
    version: 2,
    meta: {
      url: input.url,
      keyword: input.keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      scannedAt: input.scannedAt,
      pagesAnalyzed,
      provider: "dataforseo",
      analysisMethod: "dataforseo-content-parsing",
    },
    score,
    grade,
    summary,
    target: pageMetrics(
      source.target,
      stats.targetEntityCount,
      stats.targetVariationCount,
    ),
    benchmark,
    terms,
    competitors: source.competitors.map((competitor) => ({
      rank: competitor.rank,
      url: competitor.url,
      title: competitor.title,
      description: competitor.description,
      page: competitor.page
        ? pageMetrics(
            competitor.page,
            entityCountFor(competitor.page),
            entityCoverage.keywordVariations.filter(
              (variation) =>
                (competitor.page?.phraseCounts?.[variation.variation] ?? 0) > 0,
            ).length,
          )
        : null,
    })),
    suggestions,
    focusAreas,
    entityCoverage,
    topicAndClassification,
    internalLinking,
    competitorTermCoverage: buildCompetitorTermCoverage(
      terms,
      source.target,
      competitorPages,
    ),
  };
}
