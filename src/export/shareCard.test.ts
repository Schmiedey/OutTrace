import { describe, expect, it } from "vitest";
import { shareCardData } from "./shareCard";
import type { ScanRow } from "@/src/types/graph";
describe("public share-card surface", () => {
  it("contains a domain and aggregate score, never a private path, title or evidence", () => {
    const scan: ScanRow = { siteId: 1, domain: "example.test", url: "https://example.test/private?token=secret", title: "My confidential document", timestamp: 1, nodeCount: 0, edgeCount: 0, thirdPartyCount: 0, trackerCount: 0 };
    const data = shareCardData(scan, { scanId: 1, originDomain: "example.test", nodes: [], edges: [] });
    expect(data.site).toBe("example.test");
    expect(data.score).toBe(100);
    expect(JSON.stringify(data)).not.toMatch(/secret|confidential|private|token/);
    expect(Object.keys(data)).not.toContain("url");
  });
});
