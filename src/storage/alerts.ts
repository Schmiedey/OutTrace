import { diffSnapshots } from "@/src/analysis/diff";
import { activityImportance, classifyChange, isConfirmedTracker, privacyResources } from "@/src/analysis/changeImportance";
import { getSiteMemory } from "@/src/storage/siteMemory";
import { refreshActiveTabBadge } from "@/src/extension/badge";
import { db } from "@/src/storage/database";
import {
  listIgnoredDomains,
  notificationsEnabled,
  notificationMode,
} from "@/src/storage/settings";
import type { AlertRow, ScanGraphSnapshot, ScanRow } from "@/src/types/graph";
import { noteUsage } from "@/src/telemetry/usage";

async function paidNotificationsEnabled(): Promise<boolean> {
  const { getBillingStatus } = await import("@/src/billing/extpay");
  return (await getBillingStatus()).paid;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_DIGEST_KEY = "weekly-digest-at";

/** Trackers jumped by ≥2 and grew ≥25%, or first appeared on a tracker-free site. */
export { isTrackerSurge } from "@/src/analysis/changeImportance";

export async function listRecentAlerts(limit = 20, meaningfulOnly = false): Promise<AlertRow[]> {
  return await db.alerts.orderBy("timestamp").reverse().filter((alert) => !meaningfulOnly || activityImportance(alert) !== "routine").limit(limit).toArray();
}

export async function unreadAlertCount(): Promise<number> {
  const rows = await db.alerts.toArray();
  return rows.filter((row) => !row.read && activityImportance(row) !== "routine").length;
}

export async function markActivityRead(id: number): Promise<void> {
  await db.alerts.update(id, { read: true }); await syncAlertBadge();
}

export async function markScanActivityRead(scanId: number): Promise<void> {
  const rows = await db.alerts.filter((row) => row.toScanId === scanId && !row.read).toArray();
  await Promise.all(rows.map((row) => row.id !== undefined ? db.alerts.update(row.id, { read: true }) : Promise.resolve()));
  await syncAlertBadge();
}

export async function markAlertsRead(domain?: string, throughScanId?: number): Promise<void> {
  const unread = await db.alerts.filter((row) => !row.read && (!domain || row.siteDomain === domain) && (throughScanId === undefined || row.toScanId <= throughScanId)).toArray();
  await Promise.all(
    unread.map((row) => (row.id !== undefined ? db.alerts.update(row.id, { read: true }) : Promise.resolve())),
  );
  await syncAlertBadge(0);
}

/** Send at most one summary per week, and stay quiet when nothing changed. */
let digestInFlight = false;
export async function maybeNotifyWeeklyDigest(now = Date.now()): Promise<void> {
  if (digestInFlight) return;
  digestInFlight = true;
  try { await sendWeeklyDigest(now); } finally { digestInFlight = false; }
}
async function sendWeeklyDigest(now: number): Promise<void> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return;
  if (!(await notificationsEnabled())) return;
  const mode = await notificationMode();
  if (mode !== "weekly" && mode !== "important-weekly") return;
  if (!(await paidNotificationsEnabled())) return;
  const interval = WEEK_MS;
  const previous = await db.settings.get(LAST_DIGEST_KEY);
  const lastSent = Number(previous?.value ?? 0);
  if (Number.isFinite(lastSent) && lastSent > 0 && now - lastSent < interval) return;

  const since = lastSent > 0 ? lastSent : now - interval;
  const alerts = (await db.alerts.where("timestamp").above(since).toArray()).filter((alert) => alert.timestamp <= now && activityImportance(alert) !== "routine" && (mode === "important-weekly" || !alert.notifiedAt));
  const changedSites = new Set(alerts.map((alert) => alert.siteDomain));
  if (changedSites.size === 0) { await db.settings.put({ key: LAST_DIGEST_KEY, value: String(now) }); return; }

  const count = changedSites.size;
  try {
    await browser.notifications.create(`linkscope-digest-${String(Math.floor(now / interval))}`, {
      type: "basic",
      iconUrl: notificationIconUrl(),
      title: "Your LinkScope week",
      message: `${String(count)} ${count === 1 ? "site changed" : "sites changed"}.`,
    });
    await db.settings.put({ key: LAST_DIGEST_KEY, value: String(now) });
    await Promise.all(alerts.map((alert) => alert.id === undefined ? Promise.resolve() : db.alerts.update(alert.id, { digestedAt: now })));
    noteUsage("digest-delivered");
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
  newlyFollowedDomains: string[] = [],
): Promise<AlertRow | null> {
  if (next.id === undefined) return null;
  const ignoredDomains = await listIgnoredDomains();
  const baseline = await getSiteMemory(next.siteId, next.timestamp);
  const classification = classifyChange(previous, next, previousGraph, nextGraph, { ignoredDomains, newlyFollowedDomains, baseline });
  if ((!previous || !previousGraph) && classification.importance === "routine") return null;

  const diff = diffSnapshots(previous ?? next, next, previousGraph ?? { ...nextGraph, nodes: [], edges: [] }, nextGraph);
  const delta = next.trackerCount - (previous?.trackerCount ?? 0);
  const ignored = new Set(ignoredDomains);
  const currentResources = privacyResources(nextGraph).filter((node) => !ignored.has(node.domain));
  const previousResources = previousGraph ? privacyResources(previousGraph).filter((node) => !ignored.has(node.domain)) : [];
  const currentConfirmed = new Set(currentResources.filter(isConfirmedTracker).map((node) => node.domain));
  const previousConfirmed = new Set(previousResources.filter(isConfirmedTracker).map((node) => node.domain));
  const addedDomains = diff.added
    .filter((node) => !node.isFirstParty && !ignored.has(node.domain))
    .map((node) => node.domain);
  const removedDomains = diff.removed
    .filter((node) => !node.isFirstParty && !ignored.has(node.domain))
    .map((node) => node.domain);
  const addedTrackers = previousGraph ? [...currentConfirmed].filter((domain) => !previousConfirmed.has(domain)) : [];
  const removedTrackers = [...previousConfirmed].filter((domain) => !currentConfirmed.has(domain));
  const changedWatchedSite = addedDomains.length > 0 || removedDomains.length > 0;
  if (!changedWatchedSite && classification.importance === "routine") return null;
  const recent = await db.alerts.where("siteId").equals(next.siteId).toArray();
  const watchedRow = await db.watchedSites.get(next.domain);
  // Never still saves scans/history, but produces no inbox or badge event.
  // Every change additionally exposes routine changes in the collapsed inbox.
  if (watchedRow?.enabled && watchedRow.alertMode === "never") return null;
  if (watchedRow?.enabled && (watchedRow.alertMode ?? "important") === "important" && classification.importance === "routine") return null;
  if (classification.importance !== "routine" && recent.some((row) => row.fingerprint === classification.fingerprint && next.timestamp - row.timestamp < WEEK_MS && activityImportance(row) === classification.importance)) return null;

  const alert: AlertRow = {
    siteId: next.siteId,
    siteDomain: next.domain,
    fromScanId: previous?.id ?? next.id,
    toScanId: next.id,
    timestamp: next.timestamp,
    kind: changedWatchedSite
      ? "watched-site-change"
      : (previous?.trackerCount ?? 0) === 0
        ? "new-trackers"
        : "tracker-surge",
    addedTrackers,
    removedTrackers,
    addedDomains,
    removedDomains,
    trackerDelta: delta,
    read: classification.importance === "routine",
    ...classification,
  };
  const coalesced = recent.filter((row) => !row.read && !row.notifiedAt && row.importance !== "routine" && next.timestamp - row.timestamp < 5 * 60 * 1000).sort((a, b) => b.timestamp - a.timestamp)[0];
  let id: number;
  if (coalesced?.id !== undefined && classification.importance !== "routine") {
    alert.fromScanId = coalesced.fromScanId;
    alert.addedTrackers = [...new Set([...coalesced.addedTrackers, ...alert.addedTrackers])];
    alert.addedDomains = [...new Set([...(coalesced.addedDomains ?? []), ...addedDomains])];
    alert.removedDomains = [...new Set([...(coalesced.removedDomains ?? []), ...removedDomains])];
    alert.removedTrackers = [...new Set([...coalesced.removedTrackers, ...removedTrackers])];
    alert.reasons = [...new Map([...(coalesced.reasons ?? []), ...classification.reasons].map((reason) => [reason.code, reason])).values()];
    alert.importance = activityImportance(coalesced) === "important" ? "important" : classification.importance;
    await db.alerts.put({ ...alert, id: coalesced.id }); id = coalesced.id;
  } else id = await db.alerts.add(alert);
  const stored = { ...alert, id };
  await syncAlertBadge();
  if (watchedSite || newlyFollowedDomains.length) await browserSafeNotificationAlarm();
  return stored;
}

async function notifyScanAlert(alert: AlertRow): Promise<void> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return;
  if (!(await notificationsEnabled())) return;
  const mode = await notificationMode();
  if (mode !== "important" && mode !== "important-weekly") return;
  if (alert.digestedAt && mode !== "important-weekly") return;
  if (activityImportance(alert) !== "important" || !(await paidNotificationsEnabled())) return;
  const key = `notification-site:${alert.siteDomain}`;
  const now = Date.now();
  const claimed = await db.transaction("rw", db.settings, async () => {
    const last = Number((await db.settings.get(key))?.value ?? 0);
    if (last && now - last < DAY_MS) return false;
    await db.settings.put({ key, value: String(now) }); return true;
  });
  if (!claimed) return;
  const added = alert.addedTrackers.length;
  const message = added > 0
    ? `${String(added)} new ${added === 1 ? "tracker" : "trackers"}: ${alert.addedTrackers.slice(0, 3).join(", ")}`
    : alert.reasons?.filter((reason) => reason.importance === "important").map((reason) => reason.label).join("; ") || "Meaningful tracking change detected.";
  try {
    await browser.notifications.create(`linkscope-diff-${String(alert.fromScanId)}-${String(alert.toScanId)}`, {
      type: "basic",
      iconUrl: notificationIconUrl(),
      title: `${alert.siteDomain} changed`,
      message,
    });
    if (alert.id !== undefined) await db.alerts.update(alert.id, { notifiedAt: now });
  } catch {
    await db.settings.delete(key);
    // Notifications can be blocked even with the permission present.
  }
}

export async function syncAlertBadge(_count?: number): Promise<void> {
  await refreshActiveTabBadge();
}

export const CHANGE_NOTIFICATION_ALARM = "linkscope-change-notifications";
async function browserSafeNotificationAlarm(): Promise<void> {
  if (typeof browser !== "undefined" && browser.alarms?.create) await browser.alarms.create(CHANGE_NOTIFICATION_ALARM, { delayInMinutes: 5 });
}
export async function deliverPendingNotifications(now = Date.now()): Promise<void> {
  const alerts = await db.alerts.toArray();
  for (const alert of alerts.filter((row) => !row.read && !row.notifiedAt && row.timestamp <= now - 5 * 60 * 1000 && row.timestamp > now - DAY_MS && activityImportance(row) === "important").sort((a, b) => b.timestamp - a.timestamp)) {
    const watched = await db.watchedSites.get(alert.siteDomain);
    if (watched?.enabled && watched.alertMode === "never") continue;
    if (watched?.enabled || alert.reasons?.some((reason) => reason.code.startsWith("followed:"))) await notifyScanAlert(alert);
  }
}

function notificationIconUrl(): string {
  try {
    return browser.runtime.getURL("/icon/128.png");
  } catch {
    return "";
  }
}
