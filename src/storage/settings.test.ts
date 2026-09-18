import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./database";
import { claimFreeAuditToday, hasUsedFreeAuditToday } from "./settings";

beforeEach(async () => {
  await db.open();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 18, 12, 0, 0));
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
