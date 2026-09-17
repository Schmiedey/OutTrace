import { beforeEach, describe, expect, it, vi } from "vitest";
const glance = vi.hoisted(() => vi.fn());
vi.mock("@/src/storage/glance", () => ({ getSiteGlance: glance }));
vi.mock("@/src/storage/database", () => ({
  db: { alerts: { toArray: async () => [] } },
}));
import { applyBadgeForUrl, badgeForGlance } from "./badge";
import type { AlertRow, ScanRow } from "@/src/types/graph";
const latest: ScanRow = {
  id: 2,
  siteId: 1,
  domain: "example.test",
  url: "https://example.test",
  title: "Example",
  timestamp: 1,
  nodeCount: 0,
  edgeCount: 0,
  thirdPartyCount: 1,
  trackerCount: 1,
  privacyScore: 90,
  scoreVersion: 2,
};
const activity = (importance: AlertRow["importance"]): AlertRow => ({
  siteId: 1,
  siteDomain: latest.domain,
  fromScanId: 1,
  toScanId: 2,
  timestamp: 1,
  kind: "watched-site-change",
  addedTrackers: [],
  removedTrackers: [],
  trackerDelta: 0,
  read: false,
  importance,
  reasons: [
    { code: "owner", label: "New analytics owner", importance: importance! },
  ],
});

beforeEach(() => {
  vi.unstubAllGlobals();
  glance.mockResolvedValue(null);
});
describe("quiet per-tab action state", () => {
  it("stays blank for an unscanned page", async () => {
    const setBadgeText = vi.fn();
    const setTitle = vi.fn();
    vi.stubGlobal("browser", { action: { setBadgeText, setTitle } });
    await applyBadgeForUrl("https://example.test/private", 9);
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 9, text: "" });
    expect(setTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 9,
        title: expect.stringContaining("No saved capture"),
      }),
    );
  });
  it("labels saved results as cached rather than live", () => {
    const result = badgeForGlance({
      latest: {
        siteId: 1,
        domain: "example.test",
        url: "https://example.test",
        title: "Example",
        timestamp: 1,
        nodeCount: 0,
        edgeCount: 0,
        thirdPartyCount: 1,
        trackerCount: 1,
        privacyScore: 90,
        scoreVersion: 2,
      },
    });
    expect(result.text).toBe("");
    expect(result.title).toContain("saved capture");
    expect(result.title).toContain("Score 90");
  });
  it("stays blank for routine CDN activity", () =>
    expect(
      badgeForGlance({ latest, activity: [activity("routine")] }).text,
    ).toBe(""));
  it("counts unseen notable changes and explains the reason on hover", () => {
    const result = badgeForGlance({ latest, activity: [activity("notable")] });
    expect(result.text).toBe("+1");
    expect(result.title).toContain("New analytics owner");
  });
  it("uses ! for important activity", () =>
    expect(
      badgeForGlance({ latest, activity: [activity("important")] }).text,
    ).toBe("!"));
  it("clears viewed changes", () =>
    expect(
      badgeForGlance({
        latest,
        activity: [{ ...activity("important"), read: true }],
      }).text,
    ).toBe(""));
  it("cannot overwrite a newer navigation in the same tab", async () => {
    let resolveOld!: (value: unknown) => void;
    glance
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(null);
    const setBadgeText = vi.fn();
    const setTitle = vi.fn();
    vi.stubGlobal("browser", { action: { setBadgeText, setTitle } });
    const slow = applyBadgeForUrl("https://old.test", 99);
    await applyBadgeForUrl("https://new.test", 99);
    resolveOld({ latest: { ...latest, domain: "old.test" } });
    await slow;
    expect(setBadgeText).toHaveBeenCalledTimes(1);
    expect(setTitle.mock.calls[0]![0].title).not.toContain("old.test");
  });
  it("always targets the original tab even after rapid tab switching", async () => {
    let resolveOld!: (value: unknown) => void;
    glance
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(null);
    const setBadgeText = vi.fn();
    const setTitle = vi.fn();
    vi.stubGlobal("browser", { action: { setBadgeText, setTitle } });
    const slow = applyBadgeForUrl("https://old.test", 1);
    await applyBadgeForUrl("https://new.test", 2);
    resolveOld({ latest });
    await slow;
    expect(setBadgeText.mock.calls.map(([value]) => value.tabId)).toEqual([
      2, 1,
    ]);
    expect(
      setTitle.mock.calls.every(([value]) => value.tabId !== undefined),
    ).toBe(true);
  });
});
