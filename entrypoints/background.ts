import {
  applyBadgeForUrl,
  forgetActionState,
  refreshActiveTabBadge,
} from "@/src/extension/badge";
import {
  AUTO_SCAN_DWELL_MS,
  shouldAutomaticallyScan,
} from "@/src/extension/autoProtect";
import {
  automaticProtectionEnabled,
  recordShortcutUsed,
  setAutomaticProtectionEnabled,
} from "@/src/storage/settings";
import { canScanUrl } from "@/src/extension/permissions";
import { installRequestCapture } from "@/src/extension/requestLog";
import { runAudit, requestAuditCancellation } from "@/src/audit/runner";
import {
  openDashboard,
  scanActiveTab,
  watchActiveTab,
} from "@/src/extension/scanFlow";
import { scanWatchedVisit } from "@/src/extension/watchlistVisit";
import { revokeWatchlistPermission } from "@/src/extension/watchlistPermission";
import { blockDomain } from "@/src/extension/block";
import type { ScanProgressUpdate } from "@/src/extension/scanProgress";
import {
  CHANGE_NOTIFICATION_ALARM,
  deliverPendingNotifications,
  maybeNotifyWeeklyDigest,
  WEEKLY_DIGEST_ALARM,
} from "@/src/storage/alerts";
import { registrableDomain } from "@/src/lib/domain";
import { toggleFollowDomain } from "@/src/storage/follows";
import {
  getBillingStatus,
  openProCheckout,
  openProLogin,
  startBillingBackground,
} from "@/src/billing/extpay";
import { requirePro, requireWatchlistCapacity, runProAction } from "@/src/billing/entitlements";
import {
  installWatchedSiteSchedule,
  runDueWatchedSites,
  runWatchedSite,
  WATCHED_SITE_ALARM,
} from "@/src/extension/watchedSites";
import {
  addWatchedSite,
  listWatchedSites,
  normalizeWatchedSiteUrl,
  removeWatchedSite,
  updateWatchedSiteSchedule,
  updateWatchedSiteAlertMode,
} from "@/src/storage/watchedSites";
import type { WatchedSiteSchedule } from "@/src/types/graph";
import { sendUsageCounts, setUsageConsent } from "@/src/telemetry/usage";

type AuditTarget = {
  tabId: number;
  url: string;
  domain: string;
};

let recentAuditTarget: AuditTarget | null = null;
const runningAudits = new Map<number, Promise<void>>();
const automaticScanTimers = new Map<number, ReturnType<typeof setTimeout>>();
const automaticScansInFlight = new Set<string>();
let watchNavigationListenerInstalled = false;
function cancelAutomaticScan(tabId: number): void {
  clearTimeout(automaticScanTimers.get(tabId));
  automaticScanTimers.delete(tabId);
}
function scheduleAutomaticScan(tabId: number, url?: string): void {
  cancelAutomaticScan(tabId);
  if (!url || !canScanUrl(url)) return;
  automaticScanTimers.set(
    tabId,
    setTimeout(() => {
      automaticScanTimers.delete(tabId);
      void (async () => {
        const current = await browser.tabs.get(tabId);
        if (
          !current.active ||
          current.url !== url ||
          !(await shouldAutomaticallyScan(url))
        )
          return;
        const domain = registrableDomain(url) ?? new URL(url).hostname;
        if (automaticScansInFlight.has(domain)) return;
        automaticScansInFlight.add(domain);
        try {
          const billing = await getBillingStatus();
          if (!(await shouldAutomaticallyScan(url))) return;
          const tab = await browser.tabs.get(tabId);
          if (!tab.active || tab.url !== url) return;
          await scanActiveTab({
            tabId,
            url,
            openReport: false,
            notifyIfNew: false,
            captureMode: "automatic",
            extendedHistory: billing.paid,
          });
        } finally {
          automaticScansInFlight.delete(domain);
        }
      })().catch(() => {
        /* Closed tabs and revoked permissions cancel quietly. */
      });
    }, AUTO_SCAN_DWELL_MS),
  );
}
function auditTargetFromTab(tab: {
  id?: number;
  url?: string;
}): AuditTarget | null {
  if (tab.id === undefined || !tab.url || !canScanUrl(tab.url)) return null;
  const domain = registrableDomain(tab.url) ?? new URL(tab.url).hostname;
  return { tabId: tab.id, url: tab.url, domain };
}

async function rememberAuditTarget(tabId: number): Promise<void> {
  try {
    const target = auditTargetFromTab(await browser.tabs.get(tabId));
    if (target) recentAuditTarget = target;
  } catch {
    // Closed or restricted tabs are not audit targets.
  }
}

async function resolveAuditTarget(): Promise<AuditTarget | null> {
  if (recentAuditTarget) {
    try {
      const current = auditTargetFromTab(
        await browser.tabs.get(recentAuditTarget.tabId),
      );
      if (current) {
        recentAuditTarget = current;
        return current;
      }
    } catch {
      recentAuditTarget = null;
    }
  }

  const tabs = await browser.tabs.query({ currentWindow: true });
  const targets = tabs
    .map((tab) => ({
      target: auditTargetFromTab(tab),
      lastAccessed:
        (tab as typeof tab & { lastAccessed?: number }).lastAccessed ?? 0,
    }))
    .filter((row): row is { target: AuditTarget; lastAccessed: number } =>
      Boolean(row.target),
    )
    .sort((a, b) => b.lastAccessed - a.lastAccessed);
  recentAuditTarget = targets[0]?.target ?? null;
  return recentAuditTarget;
}

function progressReporter(
  requestId: unknown,
): ((update: ScanProgressUpdate) => void) | undefined {
  if (typeof requestId !== "string" || !requestId) return undefined;
  return (update) => {
    void browser.runtime
      .sendMessage({ type: "SCAN_PROGRESS", requestId, ...update })
      .catch(() => undefined);
  };
}

function createScanContextMenu(): void {
  // `contextMenus` is optional. Chrome exposes the namespace even before the
  // user grants it, but create() rejects asynchronously in that state.
  try {
    void Promise.resolve(
      browser.contextMenus?.create({
        id: "linkscope-scan",
        title: "Scan with LinkScope",
        contexts: ["page"],
      }),
    ).catch(() => undefined);
  } catch {
    // The optional context-menu permission is unavailable in this browser.
  }
}

function installWatchNavigationListener(): void {
  if (watchNavigationListenerInstalled) return;
  try {
    const event = browser.webNavigation?.onCompleted;
    if (!event) return;
    event.addListener((details) => {
      if (details.frameId !== 0 || !canScanUrl(details.url)) return;
      void scanWatchedVisit(details.tabId, details.url).catch(() => undefined);
    }, { url: [{ schemes: ["http", "https"] }] });
    watchNavigationListenerInstalled = true;
  } catch {
    // The optional webNavigation permission has not been granted yet.
  }
}

async function ensureWeeklyDigestAlarm(): Promise<void> {
  if (!browser.alarms?.create) return;
  const existing = browser.alarms.get
    ? await browser.alarms.get(WEEKLY_DIGEST_ALARM)
    : undefined;
  if (existing) return;
  await browser.alarms.create(WEEKLY_DIGEST_ALARM, {
    delayInMinutes: 7 * 24 * 60,
    periodInMinutes: 7 * 24 * 60,
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install") return;
    void browser.tabs.create({ url: browser.runtime.getURL("/app.html#/welcome") });
  });
  // The API permission is optional. If the user has not enabled it, this
  // simply leaves the browser's context menu untouched.
  createScanContextMenu();
  try {
    browser.contextMenus?.onClicked?.addListener((info, tab) => {
      if (info.menuItemId !== "linkscope-scan" || tab?.id === undefined || !tab.url) return;
      // Start from the user gesture immediately. The scan pipeline resolves
      // the cached entitlement at save time, so a provider round-trip cannot
      // consume the activeTab grant before injection starts.
      void scanActiveTab({ tabId: tab.id, url: tab.url }).catch(() => undefined);
    });
    browser.permissions?.onAdded?.addListener((permission) => {
      if (permission.permissions?.includes("contextMenus")) createScanContextMenu();
      if (permission.permissions?.includes("webNavigation") || permission.origins?.length) installWatchNavigationListener();
    });
  } catch {
    // Optional browser APIs may be unavailable until explicitly enabled.
  }
  startBillingBackground();
  void sendUsageCounts(false).catch(() => undefined);
  installRequestCapture();
  void installWatchedSiteSchedule().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Could not initialize watched-site schedule",
    );
  });
  void ensureWeeklyDigestAlarm().catch(() => undefined);
  void refreshActiveTabBadge().catch(() => undefined);
  void browser.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      const target = tab ? auditTargetFromTab(tab) : null;
      if (target) recentAuditTarget = target;
    })
    .catch(() => undefined);

  browser.commands.onCommand.addListener((command) => {
    if (command !== "scan-active-tab") return;
    void recordShortcutUsed();
    void scanActiveTab().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Scan failed");
    });
  });

  // `webNavigation` only produces events for origins the user granted. The
  // watchlist lookup is a second guard so a grant never expands scan scope.
  installWatchNavigationListener();

  if (browser.tabs?.onActivated) {
    browser.tabs.onActivated.addListener((info) => {
      void rememberAuditTarget(info.tabId);
      void browser.tabs
        .get(info.tabId)
        .then((tab) => {
          void applyBadgeForUrl(tab.url, tab.id).catch(() => undefined);
          if (tab.status === "complete")
            scheduleAutomaticScan(info.tabId, tab.url);
        })
        .catch(() => undefined);
    });
  }
  if (browser.tabs?.onUpdated) {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.status === "loading")
        cancelAutomaticScan(_tabId);
      if (!tab.active) return;
      const target = auditTargetFromTab(tab);
      if (target) recentAuditTarget = target;
      if (changeInfo.status !== "complete" && !changeInfo.url) return;
      void applyBadgeForUrl(tab.url, tab.id).catch(() => undefined);
      if (changeInfo.status === "complete")
        scheduleAutomaticScan(_tabId, tab.url);
    });
  }

  browser.tabs.onRemoved.addListener((tabId) => {
    cancelAutomaticScan(tabId);
    forgetActionState(tabId);
  });
  try {
    browser.permissions?.onRemoved?.addListener(() => {
      void browser.permissions
        .contains({ origins: ["*://*/*"] })
        .then(async (allowed) => {
          if (allowed) return;
          for (const tabId of automaticScanTimers.keys())
            cancelAutomaticScan(tabId);
          await setAutomaticProtectionEnabled(false);
          await browser.runtime
            .sendMessage({ type: "PROTECTION_UPDATED" })
            .catch(() => {});
        })
        .catch(() => {});
    });
  } catch {
    // The permissions API is unavailable in this browser.
  }

  if (browser.notifications?.onClicked) {
    browser.notifications.onClicked.addListener((notificationId) => {
      const first = /^linkscope-first-(\d+)$/.exec(notificationId);
      if (first) {
        void openDashboard(`/graph/${first[1]}`);
        return;
      }
      const follow = /^linkscope-follow-(\d+)$/.exec(notificationId);
      if (follow) {
        void openDashboard(`/graph/${follow[1]}`);
        return;
      }
      if (notificationId.startsWith("linkscope-digest-")) {
        void openDashboard("/");
        return;
      }
      const match = /^linkscope-diff-(\d+)-(\d+)$/.exec(notificationId);
      if (!match) {
        void openDashboard();
        return;
      }
      const url = browser.runtime.getURL(
        `/app.html#/diff/${match[1]}/${match[2]}`,
      );
      void browser.tabs.create({ url });
    });
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHANGE_NOTIFICATION_ALARM)
      void deliverPendingNotifications().catch(console.error);
    if (alarm.name === WEEKLY_DIGEST_ALARM)
      void maybeNotifyWeeklyDigest().catch(console.error);
    if (alarm.name === WATCHED_SITE_ALARM) {
      void runDueWatchedSites()
        .then(() => deliverPendingNotifications())
        .catch(console.error);
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PROTECTION_UPDATED") {
      for (const tabId of automaticScanTimers.keys())
        cancelAutomaticScan(tabId);
      void automaticProtectionEnabled()
        .then(async (enabled) => {
          if (enabled) {
            const [tab] = await browser.tabs.query({
              active: true,
              currentWindow: true,
            });
            if (tab?.id !== undefined && tab.status === "complete")
              scheduleAutomaticScan(tab.id, tab.url);
          }
          sendResponse({ ok: true });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message?.type === "SET_USAGE_CONSENT") {
      void setUsageConsent(message.enabled === true)
        .then(async () => {
          if (message.enabled === true) await sendUsageCounts(true);
          sendResponse({ ok: true });
        })
        .catch(() =>
          sendResponse({ ok: false, error: "Could not update usage consent." }),
        );
      return true;
    }
    if (message?.type === "SCAN_ACTIVE_TAB") {
      void scanActiveTab({
        onProgress: progressReporter(message.requestId),
      })
        .then((scanId) => sendResponse({ ok: true, scanId }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Scan failed",
          }),
        );
      return true;
    }

    if (message?.type === "GRADE_ACTIVE_TAB") {
      const tabId =
        typeof message.tabId === "number" ? message.tabId : undefined;
      const url = typeof message.url === "string" ? message.url : undefined;
      // A quick one-page scan is free and local. Do not block it on the
      // optional billing provider; billing is only needed for extended or
      // multi-page features.
      void scanActiveTab({
        openReport: false,
        tabId,
        url,
        notifyIfNew: false,
        force: true,
        allFrames: false,
        onProgress: progressReporter(message.requestId),
      })
        .then((scanId) => sendResponse({ ok: true, scanId }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Check failed",
          }),
        );
      return true;
    }

    if (message?.type === "GET_AUDIT_TARGET") {
      void resolveAuditTarget()
        .then((target) => sendResponse({ ok: true, target }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not find a site to audit",
          }),
        );
      return true;
    }

    if (message?.type === "RUN_SITE_AUDIT") {
      const auditId =
        typeof message.auditId === "number" ? message.auditId : NaN;
      const requestId =
        typeof message.requestId === "string" ? message.requestId : "";
      let task = runningAudits.get(auditId);
      if (!task) {
        task = runAudit(auditId, {
          onProgress: (progress) => {
            void browser.runtime
              .sendMessage({ type: "AUDIT_PROGRESS", requestId, progress })
              .catch(() => undefined);
          },
        }).finally(() => runningAudits.delete(auditId));
        runningAudits.set(auditId, task);
        // The crawl can legitimately take longer than a message channel's
        // lifetime. Progress is persisted in IndexedDB and streamed below;
        // acknowledge the start immediately instead of holding sendResponse
        // until every page has finished.
        void task.catch(() => undefined);
      }
      sendResponse({ ok: true, auditId });
      return false;
    }

    if (message?.type === "CANCEL_SITE_AUDIT") {
      const auditId =
        typeof message.auditId === "number" ? message.auditId : NaN;
      void requestAuditCancellation(auditId)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "Could not stop audit",
          }),
        );
      return true;
    }

    if (message?.type === "WATCH_ACTIVE_TAB") {
      void getBillingStatus()
        .then((status) =>
          runProAction(status, "deep-scan", () =>
            watchActiveTab(undefined, status.paid),
          ),
        )
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Watch failed",
          }),
        );
      return true;
    }

    if (message?.type === "GET_BILLING_STATUS") {
      void getBillingStatus(Boolean(message.force))
        .then((status) => sendResponse({ ok: true, status }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not check Pro status",
          }),
        );
      return true;
    }

    if (
      message?.type === "OPEN_PRO_CHECKOUT" ||
      message?.type === "OPEN_PRO_LOGIN"
    ) {
      const action =
        message.type === "OPEN_PRO_CHECKOUT" ? openProCheckout : openProLogin;
      void action()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "Could not open billing",
          }),
        );
      return true;
    }

    if (message?.type === "LIST_WATCHED_SITES") {
      void Promise.all([listWatchedSites(), getBillingStatus()])
        .then(([sites, billing]) => sendResponse({ ok: true, sites, billing }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not load watched sites",
          }),
        );
      return true;
    }

    if (message?.type === "ADD_WATCHED_SITE") {
      const url = typeof message.url === "string" ? message.url : "";
      const schedule: WatchedSiteSchedule =
        message.schedule === "visit"
          ? "visit"
          : message.schedule === "weekly"
            ? "weekly"
            : "daily";
      const accessGranted = message.accessGranted === true;
      void Promise.all([listWatchedSites(), getBillingStatus()])
        .then(async ([sites, billing]) => {
          const target = normalizeWatchedSiteUrl(url);
          requireWatchlistCapacity(billing, sites, target.domain);
          if (schedule !== "visit") requirePro(billing, "scheduled-checks");
          const site = await addWatchedSite(url, schedule, accessGranted);
          const scanId =
            !accessGranted || schedule === "visit" ? undefined : await runWatchedSite(site);
          sendResponse({ ok: true, site: { ...site, lastScanId: scanId } });
        })
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not add watched site",
          }),
        );
      return true;
    }

    if (message?.type === "RUN_WATCHED_SITE") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      void listWatchedSites()
        .then(async (sites) => {
          const site = sites.find((item) => item.domain === domain);
          if (!site) throw new Error("Watched site not found.");
          const scanId = await runWatchedSite(site);
          sendResponse({ ok: true, scanId });
        })
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not scan watched site",
          }),
        );
      return true;
    }

    if (message?.type === "UPDATE_WATCHED_SITE") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      const schedule: WatchedSiteSchedule =
        message.schedule === "visit"
          ? "visit"
          : message.schedule === "weekly"
            ? "weekly"
            : "daily";
      void getBillingStatus()
        .then((billing) => {
          if (
            message.alertMode === "important" ||
            message.alertMode === "all" ||
            message.alertMode === "never"
          )
            return updateWatchedSiteAlertMode(domain, message.alertMode);
          if (schedule === "visit") return updateWatchedSiteSchedule(domain, schedule);
          requirePro(billing, "scheduled-checks");
          return updateWatchedSiteSchedule(domain, schedule);
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not update schedule",
          }),
        );
      return true;
    }

    if (message?.type === "REMOVE_WATCHED_SITE") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      void (async () => {
        const site = (await listWatchedSites()).find((item) => item.domain === domain);
        await removeWatchedSite(domain);
        // Revoke even for rows created before the accessGranted marker was
        // introduced; removal must always drop the matching host grant.
        if (site) await revokeWatchlistPermission(site.url);
      })()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not remove watched site",
          }),
        );
      return true;
    }

    if (message?.type === "OPEN_DASHBOARD") {
      const hash = typeof message.hash === "string" ? message.hash : "/";
      void openDashboard(hash)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not open dashboard",
          }),
        );
      return true;
    }

    if (message?.type === "FOLLOW_DOMAIN") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      void toggleFollowDomain(domain)
        .then((followed) => sendResponse({ ok: true, followed }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not follow domain",
          }),
        );
      return true;
    }

    if (message?.type === "BLOCK_DOMAIN") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      void blockDomain(domain)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error ? error.message : "Could not block domain",
          }),
        );
      return true;
    }

    return false;
  });
});
