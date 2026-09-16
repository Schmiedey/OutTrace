import { describe, expect, it } from "vitest";
import { summarizeBriefing, summarizeWeeklyTrend } from "@/src/storage/briefing";
import type { AlertRow, ScanRow } from "@/src/types/graph";

const scan = (siteId: number, score: number): ScanRow => ({
  siteId,
  url: `https://site-${String(siteId)}.test`,
  title: "Site",
  domain: `site-${String(siteId)}.test`,
  timestamp: Date.now(),
  nodeCount: 1,
  edgeCount: 0,
  thirdPartyCount: 0,
  trackerCount: 0,
  privacyScore: score,
});

const alert = (siteId: number): AlertRow => ({
  siteId,
  siteDomain: `site-${String(siteId)}.test`,
  fromScanId: 1,
  toScanId: 2,
  timestamp: Date.now(),
  kind: "new-trackers",
  addedTrackers: ["tracker.test"],
  removedTrackers: [],
  trackerDelta: 1,
  read: false,
});

describe("daily briefing", () => {
  it("stays reassuring when checked sites did not change", () => {
    const result = summarizeBriefing([scan(1, 90), scan(2, 80)], []);
    expect(result.status).toBe("quiet");
    expect(result.checkedSites).toBe(2);
    expect(result.headline).toBe("Nothing important changed");
  });

  it("surfaces new trackers as attention-worthy", () => {
    const result = summarizeBriefing([scan(1, 70)], [alert(1)]);
    expect(result.status).toBe("attention");
    expect(result.newTrackers).toBe(1);
  });
});

describe("weekly trend", () => {
  it("compares average privacy scores", () => {
    const result = summarizeWeeklyTrend([scan(1, 90), scan(2, 80)], [scan(1, 70)]);
    expect(result.currentScore).toBe(85);
    expect(result.scoreDelta).toBe(15);
    expect(result.headline).toContain("better");
  });
});
