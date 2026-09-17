import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/src/storage/database";
import { setAutomaticProtectionEnabled } from "@/src/storage/settings";
import {
  automaticScanIsDue,
  AUTO_SCAN_COOLDOWN_MS,
  shouldAutomaticallyScan,
} from "./autoProtect";
const contains = vi.fn();
beforeEach(async () => {
  await db.open();
  contains.mockResolvedValue(true);
  vi.stubGlobal("browser", { permissions: { contains } });
});
afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
});
describe("permission-gated Quiet Protection", () => {
  it("is off by default, and stays off after disabling", async () => {
    expect(await shouldAutomaticallyScan("https://example.test")).toBe(false);
    await setAutomaticProtectionEnabled(true);
    expect(await shouldAutomaticallyScan("https://example.test")).toBe(false);
    const siteId = await db.sites.add({
      domain: "example.test",
      firstSeen: 1,
      lastSeen: 1,
      scanCount: 1,
    });
    await db.scans.add({
      siteId,
      domain: "example.test",
      url: "https://example.test/",
      title: "Example",
      timestamp: 1,
      nodeCount: 1,
      edgeCount: 0,
      thirdPartyCount: 0,
      trackerCount: 0,
    });
    expect(await shouldAutomaticallyScan("https://example.test")).toBe(true);
    await setAutomaticProtectionEnabled(false);
    expect(await shouldAutomaticallyScan("https://example.test")).toBe(false);
  });

  it("does not audit a unique page before a baseline exists", async () => {
    await setAutomaticProtectionEnabled(true);
    expect(await shouldAutomaticallyScan("https://new-site.test/article")).toBe(false);
  });
  it("cannot scan without optional host permission", async () => {
    await setAutomaticProtectionEnabled(true);
    contains.mockResolvedValue(false);
    expect(await shouldAutomaticallyScan("https://example.test")).toBe(false);
  });
  it("limits background checks to twelve-hour intervals", () => {
    expect(automaticScanIsDue(undefined)).toBe(true);
    expect(automaticScanIsDue(0, AUTO_SCAN_COOLDOWN_MS - 1)).toBe(false);
    expect(automaticScanIsDue(0, AUTO_SCAN_COOLDOWN_MS)).toBe(true);
  });
  it("never checks restricted or ignored pages", async () => {
    await setAutomaticProtectionEnabled(true);
    await db.settings.put({
      key: "ignored-domains",
      value: '["example.test"]',
    });
    expect(await shouldAutomaticallyScan("https://example.test")).toBe(false);
    expect(await shouldAutomaticallyScan("chrome://settings")).toBe(false);
  });
});
