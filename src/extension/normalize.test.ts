import { describe, expect, it } from "vitest";
import { loadChainFor } from "@/src/analysis/why";
import { normalizeScan } from "@/src/extension/normalize";

describe("normalizeScan dependency chains", () => {
  it("preserves page → iframe → tracker hops from frame document URLs", () => {
    const normalized = normalizeScan({
      url: "https://publisher.com/article",
      title: "Article",
      hostname: "publisher.com",
      findings: [
        {
          type: "iframe",
          url: "https://consent-vendor.com/frame",
          documentUrl: "https://publisher.com/article",
          snippet: "<iframe>",
        },
        {
          type: "script",
          url: "https://analytics-vendor.com/tag.js",
          documentUrl: "https://consent-vendor.com/frame",
          initiatorUrl: "https://publisher.com",
          snippet: "<script>",
        },
      ],
    });

    expect(normalized.snapshot.edges.map(({ source, target }) => [source, target])).toEqual([
      ["consent-vendor.com", "analytics-vendor.com"],
      ["publisher.com", "consent-vendor.com"],
    ]);
    expect(loadChainFor({ ...normalized.snapshot, scanId: 1 }, "analytics-vendor.com").hops.map((hop) => hop.domain)).toEqual([
      "publisher.com",
      "consent-vendor.com",
      "analytics-vendor.com",
    ]);
  });

  it("stores the classification source and confidence with each node", () => {
    const normalized = normalizeScan({
      url: "https://example.com",
      title: "Example",
      hostname: "example.com",
      findings: [
        { type: "script", url: "https://www.google-analytics.com/tag.js", snippet: "<script>" },
      ],
    });
    const tracker = normalized.snapshot.nodes.find((node) => node.domain === "google-analytics.com");
    expect(tracker).toMatchObject({
      category: "analytics",
      classificationSource: "curated-list",
      classificationConfidence: "high",
    });
  });

  it("marks known related brand domains as high-confidence first party", () => {
    const normalized = normalizeScan({
      url: "https://github.com/openai",
      title: "Repository",
      hostname: "github.com",
      findings: [
        { type: "stylesheet", url: "https://githubassets.com/app.css", snippet: "<link>" },
      ],
    });
    const asset = normalized.snapshot.nodes.find((node) => node.domain === "githubassets.com");
    expect(asset).toMatchObject({
      isFirstParty: true,
      classificationSource: "first-party",
      classificationConfidence: "high",
    });
  });

  it("does not count passive hyperlink destinations as loaded third parties or trackers", () => {
    const normalized = normalizeScan({
      url: "https://example.com",
      title: "Example",
      hostname: "example.com",
      findings: [
        { type: "link", url: "https://doubleclick.net/about", snippet: "<a>" },
        { type: "script", url: "https://cdnjs.cloudflare.com/app.js", snippet: "<script>" },
      ],
    });

    expect(normalized.thirdPartyCount).toBe(1);
    expect(normalized.trackerCount).toBe(0);
    expect(normalized.snapshot.nodes.some((node) => node.domain === "doubleclick.net")).toBe(true);
  });
});
