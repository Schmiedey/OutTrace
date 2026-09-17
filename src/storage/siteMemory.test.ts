import { describe, expect, it } from "vitest";
import { memoryFromSamples, unusualForSite } from "./siteMemory";
import type { ScanGraphSnapshot, ScanRow } from "@/src/types/graph";
const scan: ScanRow = {
  siteId: 1,
  domain: "example.test",
  url: "https://example.test",
  title: "Example",
  timestamp: 4,
  nodeCount: 0,
  edgeCount: 0,
  thirdPartyCount: 0,
  trackerCount: 0,
};
const graph: ScanGraphSnapshot = {
  scanId: 1,
  originDomain: scan.domain,
  nodes: ["doubleclick.net", "criteo.com", "taboola.com"].map((domain) => ({
    id: domain,
    domain,
    category: "unknown",
    isOrigin: false,
    isFirstParty: false,
    isSite: false,
    referenceCount: 1,
    hostnames: [domain],
  })),
  edges: ["doubleclick.net", "criteo.com", "taboola.com"].map((domain) => ({
    id: domain,
    source: scan.domain,
    target: domain,
    type: "script",
    count: 1,
    evidence: [],
  })),
};
describe("local site baseline", () => {
  it("uses majority sets and robust median rather than one outlier", () => {
    const samples = [1, 2, 3].map((timestamp) => ({
      timestamp,
      trackers: ["doubleclick.net"],
      owners: ["Google"],
      score: 90,
    }));
    const memory = memoryFromSamples(
      scan.domain,
      [
        ...samples,
        {
          timestamp: 4,
          trackers: ["a", "b", "c", "d"],
          owners: ["Other"],
          score: 0,
        },
      ],
      4,
    )!;
    expect(memory.normalTrackerDomains).toEqual(["doubleclick.net"]);
    expect(memory.normalOwners).toEqual(["Google"]);
    expect(memory.typicalScore).toBe(90);
    expect(memory.highestTrackerCount).toBe(4);
    expect(memory.scanCount).toBe(4);
    expect(memory.lastImportantChangeAt).toBe(4);
  });
  it("waits for enough captures before declaring behavior unusual", () => {
    const memory = memoryFromSamples(scan.domain, [
      { timestamp: 1, trackers: [], owners: [], score: 100 },
    ]);
    expect(unusualForSite(memory, scan, graph)).toBeUndefined();
  });
  it("detects an attributable tracker spike against this site's own baseline", () => {
    const memory = memoryFromSamples(
      scan.domain,
      [1, 2, 3].map((timestamp) => ({
        timestamp,
        trackers: [],
        owners: [],
        score: 100,
      })),
    );
    expect(unusualForSite(memory, scan, graph)).toContain(
      "Unusual for example.test",
    );
  });
});
