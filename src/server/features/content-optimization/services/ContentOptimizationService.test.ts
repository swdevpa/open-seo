import { describe, expect, it } from "vitest";
import { canonicalizeContentOptimizationUrl } from "./contentOptimizationUrl";

describe("canonicalizeContentOptimizationUrl", () => {
  it("adds the root slash and removes fragments before provider calls", () => {
    expect(
      canonicalizeContentOptimizationUrl(" https://quitzynapp.com#pricing "),
    ).toBe("https://quitzynapp.com/");
  });

  it("keeps a page path and query string", () => {
    expect(
      canonicalizeContentOptimizationUrl(
        "https://example.com/guide/?utm_source=test#faq",
      ),
    ).toBe("https://example.com/guide/?utm_source=test");
  });
});
