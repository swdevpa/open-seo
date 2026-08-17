/* eslint-disable max-lines -- The DataForSEO adapter keeps parsing and billing extraction in one boundary. */

import { OnPageContentParsingLiveRequestInfo } from "dataforseo-client";
import { AppError } from "@/server/lib/errors";
import { onPageApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  DataforseoChargedTaskError,
  isRecord,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { fetchLiveSerp, type SerpLiveItem } from "@/server/lib/dataforseo/serp";
import {
  CONTENT_OPTIMIZATION_TOP_PAGES,
  type ContentOptimizationPageMetrics,
} from "@/shared/content-optimization";

const CONTENT_PARSING_PATH = ["v3", "on_page", "content_parsing", "live"];

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "been",
  "being",
  "but",
  "can",
  "der",
  "die",
  "das",
  "den",
  "des",
  "ein",
  "eine",
  "einer",
  "eines",
  "for",
  "from",
  "für",
  "haben",
  "has",
  "have",
  "how",
  "ist",
  "its",
  "more",
  "nicht",
  "one",
  "oder",
  "only",
  "that",
  "the",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "und",
  "use",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
  "your",
]);

export type ContentOptimizationPageSource = Omit<
  ContentOptimizationPageMetrics,
  "entityCount" | "keywordVariationCount"
> & {
  text: string;
  termCounts: Record<string, number>;
  phraseCounts?: Record<string, number>;
  internalLinkUrls?: string[];
};

export type ContentOptimizationSource = {
  target: ContentOptimizationPageSource;
  competitors: Array<{
    rank: number;
    url: string;
    title: string | null;
    description: string | null;
    page: ContentOptimizationPageSource | null;
  }>;
};

type PageParseResult = DataforseoApiResponse<ContentOptimizationPageSource>;

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/";
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, "");
  }
}

function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
  );
}

function buildTermCounts(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const token of tokenize(text)) {
    if (token.length < 3 || STOP_WORDS.has(token) || /^\d+$/.test(token)) {
      continue;
    }
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
}

function buildPhraseCounts(text: string): Record<string, number> {
  const tokens = tokenize(text);
  const counts: Record<string, number> = {};

  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phraseTokens = tokens.slice(index, index + size);
      if (
        phraseTokens.some(
          (token) =>
            token.length < 3 || STOP_WORDS.has(token) || /^\d+$/.test(token),
        )
      ) {
        continue;
      }
      const phrase = phraseTokens.join(" ");
      counts[phrase] = (counts[phrase] ?? 0) + 1;
    }
  }

  return counts;
}

function countKeyword(text: string, keyword: string): number {
  const tokens = tokenize(text);
  const phrase = tokenize(keyword);
  if (phrase.length === 0 || phrase.length > tokens.length) return 0;

  let count = 0;
  for (let index = 0; index <= tokens.length - phrase.length; index += 1) {
    if (phrase.every((part, offset) => tokens[index + offset] === part)) {
      count += 1;
    }
  }
  return count;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/[>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHeading(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectPageContent(value: unknown): {
  text: string;
  headings: string[];
} {
  const texts: string[] = [];
  const headings: string[] = [];
  const seenText = new Set<string>();
  const seenHeadings = new Set<string>();

  const visit = (node: unknown) => {
    if (typeof node === "string") {
      const cleaned = node.trim();
      if (cleaned.length > 0 && !seenText.has(cleaned)) {
        seenText.add(cleaned);
        texts.push(cleaned);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;

    for (const [childKey, child] of Object.entries(node)) {
      if (
        typeof child === "string" &&
        ["h_title", "main_title"].includes(childKey)
      ) {
        const heading = cleanHeading(child);
        if (heading.length > 0 && !seenHeadings.has(heading)) {
          seenHeadings.add(heading);
          headings.push(heading);
        }
      }
      if (
        childKey === "text" ||
        childKey === "h_title" ||
        childKey === "main_title" ||
        childKey === "primary_content" ||
        childKey === "secondary_content" ||
        childKey === "table_content" ||
        childKey === "header" ||
        childKey === "footer" ||
        childKey === "main_topic" ||
        childKey === "secondary_topic"
      ) {
        visit(child);
      }
    }
  };

  visit(value);
  return { text: texts.join("\n"), headings };
}

function extractMarkdownHeadings(markdown: string): string[] {
  return [...markdown.matchAll(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/gm)].map((match) =>
    cleanHeading(match[2]),
  );
}

function extractLinks(
  markdown: string,
  pageUrl: string,
): {
  internal: number;
  external: number;
  internalUrls: string[];
} {
  let pageHost: string | null = null;
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch {
    // The provider already accepted the URL. A missing host only disables the
    // internal/external split; the rest of the report remains useful.
  }

  let internal = 0;
  let external = 0;
  const internalUrls = new Set<string>();
  for (const match of markdown.matchAll(/(!?)\[[^\]]*\]\(([^)]+)\)/g)) {
    if (match[1] === "!") continue;
    const raw = match[2].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:")) continue;
    try {
      const link = new URL(raw, pageUrl);
      if (pageHost !== null && link.hostname === pageHost) {
        internal += 1;
        link.hash = "";
        internalUrls.add(link.toString());
      } else external += 1;
    } catch {
      // Ignore malformed markdown links.
    }
  }
  return { internal, external, internalUrls: [...internalUrls] };
}

function extractStructuredInternalLinks(
  value: unknown,
  pageUrl: string,
): string[] {
  let pageHost: string | null = null;
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch {
    return [];
  }

  const links = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;

    for (const [key, child] of Object.entries(node)) {
      if (key === "url" && typeof child === "string") {
        try {
          const link = new URL(child, pageUrl);
          if (link.hostname === pageHost && normalizeUrl(link.toString()) !== normalizeUrl(pageUrl)) {
            link.hash = "";
            links.add(link.toString());
          }
        } catch {
          // Ignore malformed URLs in the structured response.
        }
      } else if (key === "urls") {
        visit(child);
      } else if (key === "primary_content" || key === "secondary_content" || key === "table_content") {
        visit(child);
      }
    }
  };

  visit(value);
  return [...links];
}

function parsePageItem(
  item: unknown,
  url: string,
  keyword: string,
  metadata: { title: string | null; description: string | null },
): ContentOptimizationPageSource {
  if (!isRecord(item)) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "DataForSEO returned no page data",
    );
  }

  const pageMarkdown =
    typeof item.page_as_markdown === "string" ? item.page_as_markdown : "";
  const parsedContent = collectPageContent(item.page_content);
  const markdownHeadings = extractMarkdownHeadings(pageMarkdown);
  const headings = [
    ...new Set(
      (markdownHeadings.length > 0 ? markdownHeadings : parsedContent.headings)
        .map(cleanHeading)
        .filter(Boolean),
    ),
  ];
  const text = stripMarkdown(
    pageMarkdown.length > 0 ? pageMarkdown : parsedContent.text,
  );
  const links = extractLinks(pageMarkdown, url);
  const internalLinkUrls = [
    ...new Set([
      ...links.internalUrls,
      ...extractStructuredInternalLinks(item.page_content, url),
    ]),
  ];
  const tokens = tokenize(text);

  return {
    url,
    title: metadata.title ?? headings[0] ?? null,
    description: metadata.description,
    headings,
    wordCount: tokens.length,
    h1Count: countMarkdownHeadings(pageMarkdown, 1),
    h2Count: countMarkdownHeadings(pageMarkdown, 2),
    h3Count: countMarkdownHeadings(pageMarkdown, 3),
    imageCount: (pageMarkdown.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
    internalLinkCount: links.internal,
    externalLinkCount: links.external,
    keywordFrequency: countKeyword(text, keyword),
    text,
    termCounts: buildTermCounts(text),
    phraseCounts: buildPhraseCounts(text),
    internalLinkUrls,
  };
}

function countMarkdownHeadings(markdown: string, level: number): number {
  const marker = "#".repeat(level);
  return [...markdown.matchAll(new RegExp(`^\\s{0,3}${marker}\\s+`, "gm"))]
    .length;
}

async function fetchContentPage(input: {
  url: string;
  keyword: string;
  title?: string | null;
  description?: string | null;
}): Promise<PageParseResult> {
  const response = await onPageApi().contentParsingLive([
    new OnPageContentParsingLiveRequestInfo({
      url: input.url,
      markdown_view: true,
      disable_cookie_popup: true,
    }),
  ]);
  const task = assertOk(response);
  const billing = buildTaskBilling(task);

  try {
    const result = task.result?.[0];
    const item = result?.items?.[0];
    return {
      data: parsePageItem(item, input.url, input.keyword, {
        title: input.title ?? null,
        description: input.description ?? null,
      }),
      billing,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DataforseoChargedTaskError(message, billing);
  }
}

function organicItems(items: SerpLiveItem[]) {
  return items
    .filter((item) => item.type === "organic" && item.url)
    .map((item, index) => ({
      rank: item.rank_group ?? item.rank_absolute ?? index + 1,
      url: item.url!,
      title: item.title ?? null,
      description: item.description ?? null,
    }));
}

export async function fetchContentOptimizationSource(input: {
  url: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<ContentOptimizationSource>> {
  const serp = await fetchLiveSerp({
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth: 10,
  });
  let totalCostUsd = serp.billing.costUsd;

  const serpPages = organicItems(serp.data);
  const targetKey = normalizeUrl(input.url);
  const competitorPages = serpPages
    .filter((page) => normalizeUrl(page.url) !== targetKey)
    .slice(0, CONTENT_OPTIMIZATION_TOP_PAGES);
  const pageTargets = [input.url, ...competitorPages.map((page) => page.url)];
  const serpMetadata = new Map(
    serpPages.map((page) => [normalizeUrl(page.url), page]),
  );

  const pageEntries = [...new Set(pageTargets.map(normalizeUrl))].map(
    (key) => ({
      key,
      url: pageTargets.find((url) => normalizeUrl(url) === key)!,
    }),
  );
  const settled = await Promise.allSettled(
    pageEntries.map((entry) =>
      fetchContentPage({
        url: entry.url,
        keyword: input.keyword,
        title: serpMetadata.get(entry.key)?.title,
        description: serpMetadata.get(entry.key)?.description,
      }),
    ),
  );

  const pages = new Map<string, ContentOptimizationPageSource>();
  let targetError: unknown;
  for (const [index, result] of settled.entries()) {
    if (result.status === "fulfilled") {
      totalCostUsd += result.value.billing.costUsd;
      pages.set(normalizeUrl(result.value.data.url), result.value.data);
    } else {
      if (result.reason instanceof DataforseoChargedTaskError) {
        totalCostUsd += result.reason.billing.costUsd;
      }
      if (pageEntries[index]?.key === targetKey) targetError = result.reason;
    }
  }

  const target = pages.get(targetKey);
  if (!target) {
    if (targetError !== undefined) {
      if (totalCostUsd > 0) {
        const message =
          targetError instanceof Error
            ? targetError.message
            : "DataForSEO returned no content for the target page.";
        throw new DataforseoChargedTaskError(message, {
          path: CONTENT_PARSING_PATH,
          costUsd: totalCostUsd,
        });
      }
      throw targetError;
    }
    throw new DataforseoChargedTaskError(
      "DataForSEO returned no content for the target page.",
      { path: CONTENT_PARSING_PATH, costUsd: totalCostUsd },
    );
  }

  return {
    data: {
      target,
      competitors: competitorPages.map((page) => ({
        ...page,
        page: pages.get(normalizeUrl(page.url)) ?? null,
      })),
    },
    billing: { path: CONTENT_PARSING_PATH, costUsd: totalCostUsd },
  };
}
