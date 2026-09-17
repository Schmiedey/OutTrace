import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./database";
import { createCompleteBackup, restoreCompleteBackup, pendingBlockDomains } from "./backup";
import { parseCompleteBackup } from "./backupSchema";
import { pruneSnapshots, resumeHistoryCleanup } from "./retention";

beforeEach(async () => {
  await db.open();
  vi.stubGlobal("browser", { declarativeNetRequest: { getDynamicRules: vi.fn().mockResolvedValue([{ id: 101, action: { type: "block" }, condition: { requestDomains: ["tracker.test"] } }]) } });
  await db.sites.add({ id: 7, domain: "example.test", firstSeen: 1, lastSeen: 2, scanCount: 1 });
  await db.scans.add({ id: 11, siteId: 7, url: "https://example.test", title: "Example", domain: "example.test", timestamp: 1, savedAt: 2, nodeCount: 0, edgeCount: 0, thirdPartyCount: 0, trackerCount: 0 });
  await db.scanGraphs.put({ scanId: 11, originDomain: "example.test", nodes: [], edges: [] });
  await db.settings.bulkPut([{ key: "followedDomains", value: '["tracker.test"]' }, { key: "automatic-protection", value: "true" }, { key: "private-license-token", value: "must-not-export" }]);
  await db.watchedSites.put({ domain: "example.test", url: "https://example.test", schedule: "weekly", enabled: true, createdAt: 1, nextRunAt: 2, lastScanId: 11 });
  await db.audits.add({ id: 19, domain: "example.test", rootUrl: "https://example.test", startedAt: 1, status: "running", mode: "quick", maxPages: 10, waitMs: 750, pagesDiscovered: 1, pagesScanned: 0, pagesFailed: 0, uniqueDomains: 0, thirdPartyCount: 0, trackerCount: 0, unknownCount: 0, ownerCount: 0 });
  await db.auditPages.add({ id: 23, auditId: 19, url: "https://example.test", path: "/", title: "Example", status: "completed", thirdPartyCount: 0, trackerCount: 0, unknownCount: 0 });
  await db.auditPageGraphs.put({ pageId: 23, auditId: 19, originDomain: "example.test", nodes: [], edges: [] });
});
afterEach(async () => { await db.delete(); vi.unstubAllGlobals(); });

describe("complete local backups", () => {
  it("round-trips tables and record IDs without secrets or silent scanning/block activation", async () => {
    const backup = await createCompleteBackup();
    expect(JSON.stringify(backup)).not.toContain("must-not-export");
    expect(backup.blockedDomains).toEqual(["tracker.test"]);
    await db.delete(); await db.open();
    await restoreCompleteBackup(JSON.parse(JSON.stringify(backup)));
    expect((await db.scans.get(11))?.savedAt).toBe(2);
    expect((await db.scanGraphs.get(11))?.originDomain).toBe("example.test");
    expect((await db.auditPageGraphs.get(23))?.auditId).toBe(19);
    expect((await db.audits.get(19))?.status).toBe("cancelled");
    expect((await db.watchedSites.get("example.test"))?.enabled).toBe(false);
    expect((await db.settings.get("automatic-protection"))?.value).toBe("false");
    expect((await db.settings.get("followedDomains"))?.value).toBe('["tracker.test"]');
    expect(await pendingBlockDomains()).toEqual(["tracker.test"]);
  });

  it("rejects incomplete, future, and broken-link backups before changing data", async () => {
    const backup = await createCompleteBackup();
    expect(() => parseCompleteBackup({ ...backup, formatVersion: 99 })).toThrow("unsupported");
    await expect(restoreCompleteBackup({ ...backup, tables: {} })).rejects.toThrow();
    await expect(restoreCompleteBackup({ ...backup, tables: { ...backup.tables, sites: [] } })).rejects.toThrow("broken record links");
    expect(await db.scans.count()).toBe(1);
  });

  it("rolls back all replacement writes if a later write fails", async () => {
    const backup = await createCompleteBackup();
    backup.tables.auditPages.push({ ...backup.tables.auditPages[0]!, id: 24 }); // violates unique audit + URL
    await expect(restoreCompleteBackup(backup)).rejects.toThrow();
    expect((await db.settings.get("automatic-protection"))?.value).toBe("true");
    expect((await db.watchedSites.get("example.test"))?.enabled).toBe(true);
    expect((await db.audits.get(19))?.status).toBe("running");
    expect(await db.auditPages.count()).toBe(1);
    expect(await db.scans.count()).toBe(1);
  });

  it("pauses cleanup on restore, then keeps saved scans when cleanup resumes", async () => {
    const backup = await createCompleteBackup();
    backup.tables.scans[0]!.savedAt = undefined;
    await restoreCompleteBackup(backup);
    await pruneSnapshots(Date.now(), false);
    expect(await db.scans.count()).toBe(1);
    await resumeHistoryCleanup();
    await pruneSnapshots(Date.now(), false);
    expect(await db.scans.count()).toBe(0);
  });
});
