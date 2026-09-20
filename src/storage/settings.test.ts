import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./database";
import { claimFreeAuditToday, claimPopupProNudge, consumeUpgradeFriction, hasUsedFreeAuditToday, recordUpgradeFriction } from "./settings";

beforeEach(async () => {
  await db.open();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 18, 12, 0, 0));
});

describe("restrained popup upgrade hints", () => {
  it("consumes a recent limit hit once and drops stale friction", async () => {
    await recordUpgradeFriction("audit-limit");
    expect(await consumeUpgradeFriction()).toBe("audit-limit");
    expect(await consumeUpgradeFriction()).toBeNull();
    await recordUpgradeFriction("watch-limit", Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(await consumeUpgradeFriction()).toBeNull();
  });

  it("claims only the 3rd, 10th, and 25th manual-scan milestones", async () => {
    const addScans = async (from: number, to: number): Promise<void> => {
      for (let index = from; index <= to; index += 1) {
        await db.scans.add({ siteId: 1, domain: "example.test", url: "https://example.test/", title: "Example", timestamp: index, nodeCount: 1, edgeCount: 0, thirdPartyCount: 0, trackerCount: 0, captureMode: "snapshot" });
      }
    };
    await addScans(1, 2);
    expect(await claimPopupProNudge()).toBe(false);
    await addScans(3, 3);
    expect(await claimPopupProNudge()).toBe(true);
    expect(await claimPopupProNudge()).toBe(false);
    await addScans(4, 10);
    expect(await claimPopupProNudge()).toBe(true);
    await db.scans.add({ siteId: 1, domain: "example.test", url: "https://example.test/", title: "Example", timestamp: 11, nodeCount: 1, edgeCount: 0, thirdPartyCount: 0, trackerCount: 0, captureMode: "automatic" });
    expect(await claimPopupProNudge()).toBe(false);
  });
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});

describe("daily Free site-audit allowance", () => {
  it("allows one new audit per local calendar day", async () => {
    const auditId = await db.audits.add({
      domain: "example.test",
      rootUrl: "https://example.test/",
      startedAt: Date.now(),
      status: "discovering",
      mode: "quick",
      maxPages: 10,
      waitMs: 750,
      pagesDiscovered: 1,
      pagesScanned: 0,
      pagesFailed: 0,
      uniqueDomains: 0,
      thirdPartyCount: 0,
      trackerCount: 0,
      unknownCount: 0,
      ownerCount: 0,
    });

    expect(await hasUsedFreeAuditToday()).toBe(false);
    expect(await claimFreeAuditToday(auditId)).toBe(true);
    expect(await hasUsedFreeAuditToday()).toBe(true);
    expect(await claimFreeAuditToday(auditId)).toBe(true);

    const secondAuditId = await db.audits.add({
      domain: "other.test",
      rootUrl: "https://other.test/",
      startedAt: Date.now(),
      status: "discovering",
      mode: "quick",
      maxPages: 10,
      waitMs: 750,
      pagesDiscovered: 1,
      pagesScanned: 0,
      pagesFailed: 0,
      uniqueDomains: 0,
      thirdPartyCount: 0,
      trackerCount: 0,
      unknownCount: 0,
      ownerCount: 0,
    });
    expect(await claimFreeAuditToday(secondAuditId)).toBe(false);

    vi.setSystemTime(new Date(2026, 8, 19, 9, 0, 0));
    expect(await hasUsedFreeAuditToday()).toBe(false);
    expect(await claimFreeAuditToday(secondAuditId)).toBe(true);
  });

  it("allows the claimed audit to resume after the day changes", async () => {
    const auditId = await db.audits.add({
      domain: "example.test",
      rootUrl: "https://example.test/",
      startedAt: Date.now(),
      status: "running",
      mode: "standard",
      maxPages: 50,
      waitMs: 1_000,
      pagesDiscovered: 1,
      pagesScanned: 0,
      pagesFailed: 0,
      uniqueDomains: 0,
      thirdPartyCount: 0,
      trackerCount: 0,
      unknownCount: 0,
      ownerCount: 0,
    });

    expect(await claimFreeAuditToday(auditId)).toBe(true);
    vi.setSystemTime(new Date(2026, 8, 19, 9, 0, 0));
    expect(await claimFreeAuditToday(auditId)).toBe(true);
  });
});
