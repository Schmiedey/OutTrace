import { diffSnapshots } from "@/src/analysis/diff";
import { db } from "@/src/storage/database";
import {
  alertSensitivity,
  digestFrequency,
  listIgnoredDomains,
  notificationsEnabled,
} from "@/src/storage/settings";
import type { AlertRow, ScanGraphSnapshot, ScanRow } from "@/src/types/graph";

const SURGE_MIN_ADDED = 2;
const SURGE_RATIO = 1.25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_DIGEST_KEY = "weekly-digest-at";

/** Trackers jumped by ≥2 and grew ≥25%, or first appeared on a tracker-free site. */
export function isTrackerSurge(previousCount: number, nextCount: number): boolean {
  if (previousCount === 0) return nextCount > 0;
  const delta = nextCount - previousCount;
  return delta >= SURGE_MIN_ADDED && nextCount >= previousCount * SURGE_RATIO;
}

export async function listRecentAlerts(limit = 20): Promise<AlertRow[]> {
  return await db.alerts.orderBy("timestamp").reverse().limit(limit).toArray();
}

export async function unreadAlertCount(): Promise<number> {
  const rows = await db.alerts.toArray();
  return rows.filter((row) => !row.read).length;
}

export async function markAlertsRead(): Promise<void> {
  const unread = await db.alerts.filter((row) => !row.read).toArray();
  await Promise.all(
    unread.map((row) => (row.id !== undefined ? db.alerts.update(row.id, { read: true }) : Promise.resolve())),
  );
  await syncAlertBadge(0);
}

/** Send at most one summary per week, and stay quiet when nothing changed. */
export async function maybeNotifyWeeklyDigest(now = Date.now()): Promise<void> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return;
  if (!(await notificationsEnabled())) return;
  const frequency = await digestFrequency();
  const interval = frequency === "daily" ? DAY_MS : WEEK_MS;
  const previous = await db.settings.get(LAST_DIGEST_KEY);
  const lastSent = Number(previous?.value ?? 0);
  if (Number.isFinite(lastSent) && lastSent > 0 && now - lastSent < interval) return;

  const since = lastSent > 0 ? lastSent : now - interval;
  const alerts = await db.alerts.where("timestamp").above(since).toArray();
  const changedSites = new Set(alerts.map((alert) => alert.siteDomain));
  await db.settings.put({ key: LAST_DIGEST_KEY, value: String(now) });
  if (changedSites.size === 0) return;

  const count = changedSites.size;
  try {
    await browser.notifications.create(`linkscope-digest-${String(Math.floor(now / interval))}`, {
      type: "basic",
      iconUrl: notificationIconUrl(),
      title: frequency === "daily" ? "Your LinkScope day" : "Your LinkScope week",
      message: `${String(count)} watched ${count === 1 ? "site changed" : "sites changed"}.`,
    });
  } catch {
    // Notifications can be blocked even with the permission present.
  }
}

export async function recordScanAlert(
  previous: ScanRow | undefined,
  next: ScanRow,
  nextGraph: ScanGraphSnapshot,
  previousGraph: ScanGraphSnapshot | undefined,
  watchedSite = false,
): Promise<AlertRow | null> {
  if (!watchedSite || !previous?.id || next.id === undefined || !previousGraph) return null;

  const diff = diffSnapshots(previous, next, previousGraph, nextGraph);
  const delta = next.trackerCount - previous.trackerCount;
  const ignored = new Set(await listIgnoredDomains());
  const addedDomains = diff.added
    .filter((node) => !node.isFirstParty && !ignored.has(node.domain))
    .map((node) => node.domain);
  const removedDomains = diff.removed
    .filter((node) => !node.isFirstParty && !ignored.has(node.domain))
    .map((node) => node.domain);
  const addedTrackers = diff.addedTrackers.filter((node) => !ignored.has(node.domain)).map((node) => node.domain);
  const removedTrackers = diff.removedTrackers.filter((node) => !ignored.has(node.domain)).map((node) => node.domain);
  const changedWatchedSite = addedDomains.length > 0 || removedDomains.length > 0;
  const surge = isTrackerSurge(previous.trackerCount, next.trackerCount);
  const sensitivity = await alertSensitivity();
  const important = addedTrackers.length > 0 || surge;
  if ((!changedWatchedSite && !surge) || (sensitivity === "important" && !important)) return null;

  const alert: AlertRow = {
    siteId: next.siteId,
    siteDomain: next.domain,
    fromScanId: previous.id,
    toScanId: next.id,
    timestamp: next.timestamp,
    kind: changedWatchedSite
      ? "watched-site-change"
      : previous.trackerCount === 0
        ? "new-trackers"
        : "tracker-surge",
    addedTrackers,
    removedTrackers,
    addedDomains,
    removedDomains,
    trackerDelta: delta,
    read: false,
  };

  const id = await db.alerts.add(alert);
  const stored = { ...alert, id };
  await syncAlertBadge();
  await notifyScanAlert(stored);
  return stored;
}

async function notifyScanAlert(alert: AlertRow): Promise<void> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return;
  if (!(await notificationsEnabled())) return;
  const added = alert.addedTrackers.length;
  const message = added > 0
    ? `${String(added)} new ${added === 1 ? "tracker" : "trackers"}: ${alert.addedTrackers.slice(0, 3).join(", ")}`
    : `${String(alert.addedDomains?.length ?? 0)} added · ${String(alert.removedDomains?.length ?? 0)} removed`;
  try {
    await browser.notifications.create(`linkscope-diff-${String(alert.fromScanId)}-${String(alert.toScanId)}`, {
      type: "basic",
      iconUrl: notificationIconUrl(),
      title: `${alert.siteDomain} changed`,
      message,
    });
  } catch {
    // Notifications can be blocked even with the permission present.
  }
}

export async function syncAlertBadge(_count?: number): Promise<void> {
  // Toolbar badge is owned by applyBadgeForUrl — unread alerts live in the dashboard.
}

export async function notifyFirstSiteCheck(input: {
  domain: string;
  scanId: number;
  thirdPartyCount: number;
  trackerCount: number;
}): Promise<void> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return;
  if (!(await notificationsEnabled())) return;
  const parties =
    input.thirdPartyCount === 1 ? "1 third-party domain" : `${String(input.thirdPartyCount)} third-party domains`;
  const trackers =
    input.trackerCount === 0
      ? "no trackers"
      : input.trackerCount === 1
        ? "1 tracker"
        : `${String(input.trackerCount)} trackers`;
  try {
    await browser.notifications.create(`linkscope-first-${String(input.scanId)}`, {
      type: "basic",
      iconUrl: notificationIconUrl(),
      title: input.domain,
      message: `First check · ${parties} · ${trackers}`,
    });
  } catch {
    // Notifications can be blocked even with the permission present.
  }
}

export async function notifyFollowedSeen(input: {
  domain: string;
  scanId: number;
  followed: string[];
}): Promise<void> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return;
  if (!(await notificationsEnabled())) return;
  const sample = input.followed.slice(0, 3).join(", ");
  const who =
    input.followed.length === 1
      ? sample
      : `${String(input.followed.length)} watched domains`;
  try {
    await browser.notifications.create(`linkscope-follow-${String(input.scanId)}`, {
      type: "basic",
      iconUrl: notificationIconUrl(),
      title: `Watched domain on ${input.domain}`,
      message: `${who} appeared here.`,
    });
  } catch {
    // Notifications can be blocked even with the permission present.
  }
}

function notificationIconUrl(): string {
  try {
    return browser.runtime.getURL("/icon/128.png");
  } catch {
    return "";
  }
}
