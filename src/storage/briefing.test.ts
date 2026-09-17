import { describe, expect, it } from "vitest";
import { localDayStart, summarizeBriefing, summarizeWeeklyTrend } from "@/src/storage/briefing";
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
  scoreVersion: 2,
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
    expect(result.headline).toBe("All quiet today");
  });

  it("surfaces new trackers as attention-worthy", () => {
    const result = summarizeBriefing([scan(1, 70)], [alert(1)]);
    expect(result.status).toBe("attention");
    expect(result.newTrackers).toBe(1);
  });
  it("counts one repeatedly scanned site once and leaves routine changes quiet", () => {
    const result = summarizeBriefing(Array.from({ length: 10 }, () => scan(1, 80)), [{ ...alert(1), importance: "routine", addedTrackers: [] }]);
    expect(result.checkedSites).toBe(1); expect(result.checks).toBe(1); expect(result.status).toBe("quiet"); expect(result.routineChanges).toBe(1);
  });
});

describe("weekly trend", () => {
  it("compares average privacy scores", () => {
    const result = summarizeWeeklyTrend([scan(1, 90), scan(2, 80), scan(3, 85)], [scan(1, 70), scan(2, 60), scan(3, 65)]);
    expect(result.currentScore).toBe(85);
    expect(result.scoreDelta).toBe(20);
    expect(result.headline).toContain("better");
  });
  it("weights each site once, using its latest observation", () => {
    const old = { ...scan(1, 0), timestamp: 1 };
    const result = summarizeWeeklyTrend([...Array.from({ length: 10 }, () => old), { ...scan(1, 80), timestamp: 2 }, scan(2, 100)], []);
    expect(result.currentScore).toBe(90); expect(result.sitesChecked).toBe(2);
  });
  it("suppresses score movement for too-small or mismatched samples", () => {
    expect(summarizeWeeklyTrend([scan(1, 90)], [scan(1, 0)]).scoreDelta).toBeUndefined();
    expect(summarizeWeeklyTrend([scan(1, 90), scan(2, 90), scan(3, 90)], [scan(4, 0), scan(5, 0), scan(6, 0)]).scoreDelta).toBeUndefined();
  });
  it("uses local calendar midnight, not a rolling 24 hours", () => {
    const now = new Date(2026, 8, 16, 15, 30).getTime();
    expect(localDayStart(now)).toBe(new Date(2026, 8, 16).getTime());
  });
});
