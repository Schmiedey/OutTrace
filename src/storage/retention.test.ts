import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db, LinkScopeDB } from "./database";
import { pruneSnapshots, FREE_MAX_STORED_SCANS } from "./retention";
import { exportArchive, importArchive, parseArchive } from "./archive";
import type { ScanRow } from "@/src/types/graph";

const scan = (timestamp: number, savedAt?: number): ScanRow => ({
  siteId: 1, domain: "example.test", url: "https://example.test", title: "Example",
  timestamp, savedAt, nodeCount: 0, edgeCount: 0, thirdPartyCount: 0, trackerCount: 0,
});

beforeEach(async () => { await db.open(); });

afterEach(async () => {
  await db.delete();
});

describe("durable saved scans", () => {
  it("preserves saved scans and their graphs after expiry and overflow", async () => {
    const now = Date.now();
    await db.sites.add({ id: 1, domain: "example.test", firstSeen: 1, lastSeen: now, scanCount: 22 });
    const savedId = await db.scans.add(scan(1, now));
    await db.scanGraphs.put({ scanId: savedId, originDomain: "example.test", nodes: [], edges: [] });
    await db.scans.bulkAdd(Array.from({ length: FREE_MAX_STORED_SCANS + 1 }, (_, index) => scan(now - index)));
    await pruneSnapshots(now, false);
    expect(await db.scans.count()).toBe(FREE_MAX_STORED_SCANS + 1);
    expect(await db.scans.get(savedId)).toBeDefined();
    expect(await db.scanGraphs.get(savedId)).toBeDefined();
    await db.scans.update(savedId, { savedAt: undefined });
    await pruneSnapshots(now, false);
    expect(await db.scans.get(savedId)).toBeUndefined();
    expect(await db.scanGraphs.get(savedId)).toBeUndefined();
  });

  it("round-trips saved status and rejects unknown future archive formats", async () => {
    await db.sites.add({ id: 1, domain: "example.test", firstSeen: 1, lastSeen: 2, scanCount: 1 });
    const id = await db.scans.add(scan(1, 2));
    await db.scanGraphs.put({ scanId: id, originDomain: "example.test", nodes: [], edges: [] });
    const archive = parseArchive(await exportArchive());
    await db.delete();
    await db.open();
    await importArchive(archive);
    expect((await db.scans.toArray())[0]?.savedAt).toBe(2);
    expect(() => parseArchive({ ...archive, formatVersion: 999 })).toThrow("newer format");
  });

  it("upgrades a populated version-1 installation without losing records", async () => {
    const name = "linkscope-migration-test";
    const old = new Dexie(name);
    old.version(1).stores({
      sites: "++id, &domain, lastSeen", scans: "++id, siteId, domain, timestamp",
      scanGraphs: "scanId", domains: "&domain, category, lastSeen, seenOnCount",
      sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
    });
    await old.table("scans").add({ ...scan(1), id: 1 });
    old.close();
    const upgraded = new LinkScopeDB(name);
    try {
      await upgraded.open();
      expect((await upgraded.scans.get(1))?.domain).toBe("example.test");
      expect(upgraded.verno).toBe(6);
      expect(await upgraded.watchedSites.count()).toBe(0);
    } finally {
      await upgraded.delete();
    }
  });
});
