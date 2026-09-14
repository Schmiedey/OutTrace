import { describe, expect, it } from "vitest";
import { describeDomain } from "@/src/analysis/categorizer";

describe("describeDomain", () => {
  it("reports a high-confidence curated classification", () => {
    expect(describeDomain("www.google-analytics.com")).toMatchObject({
      category: "analytics",
      source: "curated-list",
      confidence: "high",
    });
  });

  it("reports heuristic classifications without presenting them as list matches", () => {
    expect(describeDomain("assets.example-service.invalid")).toEqual({
      category: "cdn",
      listed: false,
      source: "heuristic",
      confidence: "medium",
    });
  });

  it("keeps unmatched domains explicitly unknown and low-confidence", () => {
    expect(describeDomain("unrecognized-example.invalid")).toEqual({
      category: "unknown",
      listed: false,
      source: "unknown",
      confidence: "low",
    });
  });
});
