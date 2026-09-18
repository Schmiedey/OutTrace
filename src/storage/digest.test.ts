import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const license = vi.hoisted(() => vi.fn());
vi.mock("@/src/billing/extpay", () => ({ getBillingStatus: license }));
vi.mock("@/src/telemetry/usage", () => ({ noteUsage: vi.fn() }));
import { db } from "./database";
import { maybeNotifyWeeklyDigest } from "./alerts";
import { setNotificationMode } from "./settings";
const now = Date.now();
const create = vi.fn();
beforeEach(async () => {
  await db.open(); license.mockResolvedValue({ paid: true }); create.mockReset(); create.mockResolvedValue("notification");
  await setNotificationMode("weekly");
  vi.stubGlobal("browser", { notifications: { create }, runtime: { getURL: (path: string) => path } });
});
afterEach(async () => { await db.delete(); vi.unstubAllGlobals(); });
async function changedSite() {
  await db.watchedSites.put({ domain: "example.test", url: "https://example.test", schedule: "weekly", enabled: true, createdAt: now, nextRunAt: now });
  await db.alerts.add({ siteId: 1, siteDomain: "example.test", fromScanId: 1, toScanId: 2, timestamp: now - 1000, kind: "watched-site-change", addedTrackers: ["tracker.test"], removedTrackers: [], trackerDelta: 1, read: false });
}
describe("native digest", () => {
  it("stays silent when nothing changed", async () => {
    await maybeNotifyWeeklyDigest(now); expect(create).not.toHaveBeenCalled();
  });
  it("delivers one native summary per interval", async () => {
    await changedSite(); await maybeNotifyWeeklyDigest(now); await maybeNotifyWeeklyDigest(now + 1000);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.stringContaining("linkscope-digest-"), expect.objectContaining({ message: "1 new tracker spotted across your 1 watched site this week." }));
  });
  it("retries after a notification failure instead of marking undelivered data as sent", async () => {
    await changedSite(); create.mockRejectedValueOnce(new Error("Denied"));
    await maybeNotifyWeeklyDigest(now);
    expect(await db.settings.get("weekly-digest-at")).toBeUndefined();
    await maybeNotifyWeeklyDigest(now + 1000); expect(create).toHaveBeenCalledTimes(2);
  });
  it("respects disabled notifications and Pro entitlements", async () => {
    await changedSite(); license.mockResolvedValue({ paid: false }); await maybeNotifyWeeklyDigest(now);
    expect(create).not.toHaveBeenCalled();
    license.mockResolvedValue({ paid: true }); await db.settings.put({ key: "notifications", value: "false" }); await maybeNotifyWeeklyDigest(now);
    expect(create).not.toHaveBeenCalled();
  });
});
