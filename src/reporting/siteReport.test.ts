import { describe, expect, it } from "vitest";
import { buildSiteReport, siteReportText } from "./siteReport";
import type { ScanRow, ScanGraphSnapshot } from "@/src/types/graph";
const scan: ScanRow = {
  id: 2,
  siteId: 1,
  domain: "client.test",
  url: "https://client.test/private?token=secret",
  title: "Private title",
  timestamp: 2000,
  nodeCount: 2,
  edgeCount: 1,
  thirdPartyCount: 1,
  trackerCount: 0,
};
function graph(
  scanId: number,
  type: "link" | "script" = "script",
): ScanGraphSnapshot {
  return {
    scanId,
    originDomain: scan.domain,
    nodes: [
      {
        id: "doubleclick.net",
        domain: "doubleclick.net",
        isOrigin: false,
        isSite: false,
        isFirstParty: false,
        category: "advertising",
        referenceCount: 1,
        hostnames: ["doubleclick.net"],
      },
    ],
    edges: [
      {
        id: "edge",
        source: scan.domain,
        target: "doubleclick.net",
        type,
        count: 1,
        evidence: [
          {
            type,
            url: "https://doubleclick.net/?secret=123",
            hostname: "doubleclick.net",
            snippet: "private evidence",
          },
        ],
      },
    ],
  };
}
describe("client reports", () => {
  it("does not turn passive links into observed tracking services", () => {
    const report = buildSiteReport(scan, graph(2, "link"));
    expect(report.resources).toEqual([]);
    expect(report.score.score).toBe(100);
  });
  it("describes a first capture as a baseline rather than new tracking", () => {
    const report = buildSiteReport(scan, graph(2));
    expect(report.added).toEqual([]);
    expect(report.previous).toBeUndefined();
    expect(siteReportText(report)).toContain("Initial capture");
  });
  it("identifies a resource appearing after it was only a hyperlink", () => {
    const report = buildSiteReport(scan, graph(2), {
      scan: { ...scan, id: 1, timestamp: 1000 },
      graph: graph(1, "link"),
    });
    expect(report.added.map((node) => node.domain)).toEqual([
      "doubleclick.net",
    ]);
    expect(report.change.importance).toBe("important");
  });
  it("rejects cross-site, reversed, and mismatched-evidence comparisons", () => {
    expect(() => buildSiteReport(scan, graph(1))).toThrow();
    expect(() =>
      buildSiteReport(scan, graph(2), {
        scan: { ...scan, id: 1, timestamp: 1000, siteId: 3 },
        graph: graph(1),
      }),
    ).toThrow();
    expect(() =>
      buildSiteReport(scan, graph(2), {
        scan: { ...scan, id: 1, timestamp: 3000 },
        graph: graph(1),
      }),
    ).toThrow();
  });
  it("omits page paths, queries, titles and raw evidence from the downloadable report", () => {
    const text = siteReportText(buildSiteReport(scan, graph(2)));
    expect(text).toContain("client.test");
    expect(text).toContain("doubleclick.net");
    for (const secret of [
      scan.url,
      scan.title,
      "token=secret",
      "private evidence",
      "secret=123",
    ])
      expect(text).not.toContain(secret);
    expect(text).toContain("not proof of data collection");
  });
});
