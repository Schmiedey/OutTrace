import { describe, expect, it } from "vitest";
import { classifyChange } from "./changeImportance";
import type {
  GraphNodeRecord,
  ScanGraphSnapshot,
  ScanRow,
} from "@/src/types/graph";

const scan: ScanRow = {
  id: 1,
  siteId: 1,
  domain: "example.test",
  url: "https://example.test",
  title: "Example",
  timestamp: 1,
  nodeCount: 0,
  edgeCount: 0,
  thirdPartyCount: 0,
  trackerCount: 0,
};
const node = (
  domain: string,
  category: GraphNodeRecord["category"] = "advertising",
): GraphNodeRecord => ({
  id: domain,
  domain,
  category,
  isOrigin: false,
  isSite: false,
  isFirstParty: false,
  referenceCount: 1,
  hostnames: [domain],
  listed: category === "advertising",
  classificationSource: category === "advertising" ? "curated-list" : "unknown",
});
const graph = (
  nodes: GraphNodeRecord[],
  type: "script" | "link" = "script",
): ScanGraphSnapshot => ({
  scanId: 1,
  originDomain: scan.domain,
  nodes,
  edges: nodes.map((node) => ({
    id: node.domain,
    source: scan.domain,
    target: node.domain,
    type,
    count: 1,
    evidence: [],
  })),
});
const classify = (before: GraphNodeRecord[], after: GraphNodeRecord[]) =>
  classifyChange(scan, { ...scan, id: 2 }, graph(before), graph(after));

describe("shared change importance", () => {
  it("does not alert on an initial capture", () =>
    expect(
      classifyChange(
        undefined,
        scan,
        undefined,
        graph([node("doubleclick.net")]),
      ).importance,
    ).toBe("routine"));
  it("marks the first confirmed tracker important", () => {
    const result = classify([], [node("doubleclick.net")]);
    expect(result.importance).toBe("important");
    expect(
      result.reasons.some((reason) => reason.code === "first-tracker"),
    ).toBe(true);
  });
  it("marks a new confirmed tracker important", () =>
    expect(
      classify(
        [node("doubleclick.net")],
        [node("doubleclick.net"), node("criteo.com")],
      ).importance,
    ).toBe("important"));
  it("never treats removal as an important change", () =>
    expect(classify([node("doubleclick.net")], []).importance).toBe("routine"));
  it("ignores CDN and first-party churn", () =>
    expect(
      classify(
        [],
        [
          node("static.example.test", "cdn"),
          { ...node("assets.example.test"), isFirstParty: true },
        ],
      ).importance,
    ).toBe("routine"));
  it("ignores score-only changes", () =>
    expect(
      classifyChange(
        { ...scan, privacyScore: 100 },
        { ...scan, privacyScore: 50 },
        graph([]),
        graph([]),
      ).importance,
    ).toBe("routine"));
  it("requires loaded resources rather than links", () =>
    expect(
      classifyChange(
        scan,
        scan,
        graph([]),
        graph([node("doubleclick.net")], "link"),
      ).importance,
    ).toBe("routine"));
  it("marks several unknown resources notable, not dangerous", () =>
    expect(
      classify(
        [],
        [
          node("a.test", "unknown"),
          node("b.test", "unknown"),
          node("c.test", "unknown"),
        ],
      ).importance,
    ).toBe("notable"));
  it("marks a followed domain on a new site important", () =>
    expect(
      classifyChange(
        undefined,
        scan,
        undefined,
        graph([node("a.test", "unknown")]),
        { newlyFollowedDomains: ["a.test"] },
      ).importance,
    ).toBe("important"));
  it("respects ignored domains", () =>
    expect(
      classifyChange(scan, scan, graph([]), graph([node("doubleclick.net")]), {
        ignoredDomains: ["doubleclick.net"],
      }).importance,
    ).toBe("routine"));
});
