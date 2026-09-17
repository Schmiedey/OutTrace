import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/src/billing/extpay", () => ({
  getBillingStatus: async () => ({ paid: true }),
}));
vi.mock("@/src/telemetry/usage", () => ({ noteUsage: vi.fn() }));
import { db } from "./database";
import {
  deliverPendingNotifications,
  markAlertsRead,
  maybeNotifyWeeklyDigest,
  recordScanAlert,
} from "./alerts";
import {
  notificationMode,
  notificationsEnabled,
  setNotificationMode,
} from "./settings";
import type { ScanGraphSnapshot, ScanRow } from "@/src/types/graph";
const now = new Date(2026, 8, 16, 12).getTime();
const create = vi.fn();
const alarm = vi.fn();
const scan = (id: number, timestamp = now - 10 * 60 * 1000): ScanRow => ({
  id,
  siteId: 1,
  domain: "example.test",
  url: "https://example.test",
  title: "Example",
  timestamp,
  nodeCount: 0,
  edgeCount: 0,
  thirdPartyCount: 0,
  trackerCount: 0,
});
const graph = (domains: string[]): ScanGraphSnapshot => ({
  scanId: 1,
  originDomain: "example.test",
  nodes: domains.map((domain) => ({
    id: domain,
    domain,
    category: "unknown",
    isFirstParty: false,
    isOrigin: false,
    isSite: false,
    referenceCount: 1,
    hostnames: [domain],
  })),
  edges: domains.map((domain) => ({
    id: domain,
    source: "example.test",
    target: domain,
    type: "script",
    count: 1,
    evidence: [],
  })),
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await db.open();
  create.mockReset();
  create.mockResolvedValue("notification");
  alarm.mockReset();
  vi.stubGlobal("browser", {
    notifications: { create },
    alarms: { create: alarm },
    runtime: { getURL: (path: string) => path },
  });
  await db.watchedSites.put({
    domain: "example.test",
    url: "https://example.test",
    schedule: "daily",
    enabled: true,
    createdAt: now,
    nextRunAt: now,
    alertMode: "important",
  });
});
afterEach(async () => {
  await db.delete();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("quiet local activity and notification policy", () => {
  it("defaults notifications off while retaining local activity", async () => {
    expect(await notificationsEnabled()).toBe(false);
    expect(await notificationMode()).toBe("none");
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await deliverPendingNotifications(now);
    await maybeNotifyWeeklyDigest(now);
    expect(await db.alerts.count()).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });
  it("records notable activity without an immediate notification", async () => {
    await setNotificationMode("important");
    const event = await recordScanAlert(
      scan(1),
      scan(2),
      graph(["a.test", "b.test", "c.test"]),
      graph([]),
      true,
    );
    expect(event?.importance).toBe("notable");
    await deliverPendingNotifications(now);
    expect(create).not.toHaveBeenCalled();
  });
  it("coalesces nearby changes into one site event and one notification", async () => {
    await setNotificationMode("important");
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    const event = await recordScanAlert(
      scan(2),
      scan(3, now - 9 * 60 * 1000),
      graph(["doubleclick.net", "criteo.com"]),
      graph(["doubleclick.net"]),
      true,
    );
    expect(await db.alerts.count()).toBe(1);
    expect(event?.addedTrackers).toEqual(["doubleclick.net", "criteo.com"]);
    await deliverPendingNotifications(now);
    await deliverPendingNotifications(now);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        message: expect.stringContaining("2 new trackers"),
      }),
    );
  });
  it("waits five minutes before delivery", async () => {
    await setNotificationMode("important");
    await recordScanAlert(
      scan(1),
      scan(2, now),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await deliverPendingNotifications(now);
    expect(create).not.toHaveBeenCalled();
    vi.setSystemTime(now + 5 * 60 * 1000);
    await deliverPendingNotifications(now + 5 * 60 * 1000);
    expect(create).toHaveBeenCalledOnce();
  });
  it("limits immediate notifications to one per site per 24h", async () => {
    await setNotificationMode("important");
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await deliverPendingNotifications(now);
    await recordScanAlert(
      scan(2),
      scan(3, now - 6 * 60 * 1000),
      graph(["doubleclick.net", "criteo.com"]),
      graph(["doubleclick.net"]),
      true,
    );
    await deliverPendingNotifications(now);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("deduplicates identical meaningful changes for seven days", async () => {
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await markAlertsRead();
    expect(
      await recordScanAlert(
        scan(3),
        scan(4, now),
        graph(["doubleclick.net"]),
        graph([]),
        true,
      ),
    ).toBeNull();
    expect(await db.alerts.count()).toBe(1);
  });
  it("ignores identical tracker state and routine resource churn", async () => {
    await setNotificationMode("important");
    await db.watchedSites.update("example.test", { alertMode: "all" });
    expect(
      await recordScanAlert(
        scan(1),
        scan(2),
        graph(["doubleclick.net"]),
        graph(["doubleclick.net"]),
        true,
      ),
    ).toBeNull();
    const event = await recordScanAlert(
      scan(2),
      scan(3),
      graph(["doubleclick.net", "cloudflare.com"]),
      graph(["doubleclick.net"]),
      true,
    );
    expect(event?.importance).toBe("routine");
    expect(event?.read).toBe(true);
    await deliverPendingNotifications(now);
    expect(create).not.toHaveBeenCalled();
  });
  it("does not duplicate an immediate event in a digest without opting into both", async () => {
    await setNotificationMode("important");
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await deliverPendingNotifications(now);
    await setNotificationMode("weekly");
    await maybeNotifyWeeklyDigest(now);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("allows both channels only after explicit selection", async () => {
    await setNotificationMode("important-weekly");
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await deliverPendingNotifications(now);
    await maybeNotifyWeeklyDigest(now);
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("does not re-notify weekly-delivered events when switching to immediate", async () => {
    await setNotificationMode("weekly");
    await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    await maybeNotifyWeeklyDigest(now);
    await setNotificationMode("important");
    await deliverPendingNotifications(now);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("respects watched-site Never mode and viewed events", async () => {
    await setNotificationMode("important");
    await db.watchedSites.update("example.test", { alertMode: "never" });
    const event = await recordScanAlert(
      scan(1),
      scan(2),
      graph(["doubleclick.net"]),
      graph([]),
      true,
    );
    expect(event).toBeNull();
    await deliverPendingNotifications(now);
    expect(create).not.toHaveBeenCalled();
  });
  it("creates no alert just for an initial scan", async () => {
    expect(
      await recordScanAlert(
        undefined,
        scan(1),
        graph(["doubleclick.net"]),
        undefined,
        true,
      ),
    ).toBeNull();
  });
});
