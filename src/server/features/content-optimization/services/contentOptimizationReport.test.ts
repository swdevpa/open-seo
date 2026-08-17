import { describe, expect, it } from "vitest";
import { buildContentOptimizationReport } from "./contentOptimizationReport";
import type { ContentOptimizationSource } from "@/server/lib/dataforseo/content-optimization";

function page(
  url: string,
  overrides: Partial<ContentOptimizationSource["target"]> = {},
) {
  return {
    url,
    title: "Example page",
    description: null,
    headings: ["Example page", "Details"],
    wordCount: 1_000,
    h1Count: 1,
    h2Count: 4,
    h3Count: 1,
    imageCount: 2,
    internalLinkCount: 3,
    externalLinkCount: 1,
    keywordFrequency: 4,
    text: "",
    termCounts: { strategy: 4, guide: 3, missing: 2 },
    ...overrides,
  };
}

describe("buildContentOptimizationReport", () => {
  it("scores the target against parsed competitors and marks missing terms", () => {
    const source: ContentOptimizationSource = {
      target: page("https://example.com/page", {
        wordCount: 700,
        h1Count: 0,
        h2Count: 1,
        keywordFrequency: 0,
        termCounts: { strategy: 1 },
      }),
      competitors: [
        {
          rank: 1,
          url: "https://competitor.example/page",
          title: "Competitor",
          description: "Description",
          page: page("https://competitor.example/page"),
        },
      ],
    };

    const report = buildContentOptimizationReport(source, {
      url: source.target.url,
      keyword: "content optimization",
      locationCode: 2840,
      languageCode: "en",
      scannedAt: "2026-08-17T00:00:00.000Z",
    });

    expect(report.score).toBeLessThan(75);
    expect(report.grade).toBe("D");
    expect(report.meta.pagesAnalyzed).toBe(2);
    expect(report.terms.find((term) => term.term === "guide")).toMatchObject({
      status: "missing",
      competitorCoverage: 1,
    });
    expect(report.suggestions).toContain(
      "Use the target keyword in the page text and main heading.",
    );
  });

  it("falls back to target metrics when no competitor page was parsed", () => {
    const target = page("https://example.com/page");
    const report = buildContentOptimizationReport(
      {
        target,
        competitors: [
          {
            rank: 1,
            url: "https://competitor.example/page",
            title: null,
            description: null,
            page: null,
          },
        ],
      },
      {
        url: target.url,
        keyword: "example",
        locationCode: 2840,
        languageCode: "en",
        scannedAt: "2026-08-17T00:00:00.000Z",
      },
    );

    expect(report.benchmark.wordCount).toBe(target.wordCount);
    expect(report.meta.pagesAnalyzed).toBe(1);
    expect(report.summary).toContain("No competitor page could be parsed");
  });

  it("builds entity, variation, classification, question, and link sections", () => {
    const target = page("https://example.com/page", {
      text: "A short content optimization guide.",
      termCounts: { strategy: 1, guide: 1 },
      phraseCounts: { "content strategy": 1 },
      internalLinkUrls: ["https://example.com/related"],
    });
    const competitor = page("https://example.com/guide", {
      title: "Content optimization guide",
      headings: ["Content optimization guide", "Content strategy"],
      text: "A content optimization guide. What is content optimization?",
      termCounts: { strategy: 4, guide: 3 },
      phraseCounts: {
        "content strategy": 2,
        "optimization guide": 2,
      },
      internalLinkUrls: [],
    });

    const report = buildContentOptimizationReport(
      {
        target,
        competitors: [
          {
            rank: 1,
            url: competitor.url,
            title: competitor.title,
            description: null,
            page: competitor,
          },
        ],
      },
      {
        url: target.url,
        keyword: "content optimization",
        locationCode: 2840,
        languageCode: "en",
        scannedAt: "2026-08-17T00:00:00.000Z",
      },
    );

    expect(report.version).toBe(2);
    expect(report.entityCoverage.naturalLanguageEntities.length).toBeGreaterThan(0);
    expect(report.entityCoverage.keywordVariations).toContainEqual(
      expect.objectContaining({ variation: "content strategy" }),
    );
    expect(report.topicAndClassification.yourPage.category).toBe("Guide");
    expect(report.topicAndClassification.topicalAuthorityQuestions.definition).toContain(
      "What is content optimization?",
    );
    expect(report.internalLinking.existingInternalLinks).toContain(
      "https://example.com/related",
    );
    expect(report.competitorTermCoverage.terms.length).toBeGreaterThan(0);
  });
});
