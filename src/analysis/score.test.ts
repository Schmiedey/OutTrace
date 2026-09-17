import { describe, expect, it } from "vitest";
import { scoreSnapshot, scoreSummary } from "./score";
import type { GraphNodeRecord, ScanGraphSnapshot } from "@/src/types/graph";

function graph(domains: string[], type: "link" | "script" | "network" = "network"): ScanGraphSnapshot {
  const nodes: GraphNodeRecord[] = ["example.test", ...domains].map((domain, index) => ({ id: domain, domain, category: "unknown", isOrigin: index === 0, isSite: index === 0, isFirstParty: index === 0, referenceCount: 1, hostnames: [domain] }));
  return { scanId: 1, originDomain: "example.test", nodes, edges: domains.map((domain) => ({ id: domain, source: "example.test", target: domain, type, count: 1, evidence: [] })) };
}
describe("tracking exposure model v2", () => {
  it("does not penalize CDNs or hyperlink destinations", () => {
    expect(scoreSnapshot(graph(["cdnjs.cloudflare.com"], "script")).score).toBe(100);
    expect(scoreSnapshot(graph(["doubleclick.net"], "link")).trackers).toBe(0);
    expect(scoreSnapshot(graph(["doubleclick.net"], "link")).score).toBe(100);
  });
  it("has explicit curated-domain and execution penalties", () => {
    const network = scoreSnapshot(graph(["google-analytics.com"]));
    const script = scoreSnapshot(graph(["google-analytics.com"], "script"));
    expect(network.domainPenalty).toBe(8);
    expect(network.executionPenalty).toBe(0);
    expect(network.score).toBe(92);
    expect(script.score).toBe(90);
    expect(script.trackers).toBe(1);
    expect(script.modelVersion).toBe(2);
  });
  it("does not double-count repeated resources or duplicate domain nodes", () => {
    const input = graph(["google-analytics.com"], "script");
    input.edges.push({ ...input.edges[0]!, id: "again" });
    input.nodes.push({ ...input.nodes[1]! });
    expect(scoreSnapshot(input).score).toBe(90);
  });
  it("discloses uncertainty instead of equating unknown with safe", () => {
    const result = scoreSnapshot(graph(["unclassified-resource.test"]));
    expect(result.unknown).toBe(1);
    expect(result.confidence).toBe("limited");
    expect(scoreSummary(result)).toContain("unclassified");
    expect(result.reasons.join(" ")).toContain("unknown does not mean safe");
    expect(scoreSummary(result)).not.toContain("follow you across sites");
  });
});
