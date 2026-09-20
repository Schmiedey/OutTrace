import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { summarizePortfolio } from "./portfolio";
import type { AlertRow, ScanRow, WatchedSiteRow } from "@/src/types/graph";
const scan = (domain: string, timestamp: number): ScanRow => ({
  id: timestamp,
  siteId: 1,
  domain,
  url: `https://${domain}`,
  title: "",
  timestamp,
  nodeCount: 1,
  edgeCount: 0,
  thirdPartyCount: 0,
  trackerCount: 0,
});
const alert = (
  domain: string,
  importance: AlertRow["importance"],
  read = false,
): AlertRow => ({
  id: 1,
  siteId: 1,
  siteDomain: domain,
  fromScanId: 1,
  toScanId: 2,
  timestamp: 10,
  importance,
  read,
  kind: "watched-site-change",
  addedTrackers: [],
  removedTrackers: [],
  trackerDelta: 0,
});
describe("site portfolio", () => {
  it("keeps watched sites without captures visible", () => {
    const watch: WatchedSiteRow = {
      domain: "new.test",
      url: "https://new.test",
      enabled: true,
      accessGranted: false,
      createdAt: 1,
      nextRunAt: 1,
      schedule: "visit",
    };
    const rows = summarizePortfolio([], [], [watch], []);
    expect(rows[0]?.domain).toBe("new.test");
    expect(rows[0]?.latest).toBeUndefined();
    expect(rows[0]?.watch?.accessGranted).toBe(false);
  });
  it("prioritizes unread meaningful changes and selects the latest capture regardless of input order", () => {
    const sites = ["a.test", "z.test"].map((domain, id) => ({
      id,
      domain,
      firstSeen: 1,
      lastSeen: 5,
      scanCount: 2,
    }));
    const rows = summarizePortfolio(
      sites,
      [scan("z.test", 5), scan("z.test", 1)],
      [],
      [
        alert("a.test", "routine"),
        alert("a.test", "important", true),
        alert("z.test", "notable"),
      ],
    );
    expect(rows[0]?.domain).toBe("z.test");
    expect(rows[0]?.latest?.timestamp).toBe(5);
    expect(rows[0]?.pending).toHaveLength(1);
    expect(rows[1]?.pending).toHaveLength(0);
  });
});
