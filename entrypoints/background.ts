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
import { blockDomain } from "@/src/extension/block";
import type { ScanProgressUpdate } from "@/src/extension/scanProgress";
import {
  CHANGE_NOTIFICATION_ALARM,
  deliverPendingNotifications,
  maybeNotifyWeeklyDigest,
} from "@/src/storage/alerts";
import { registrableDomain } from "@/src/lib/domain";
import { toggleFollowDomain } from "@/src/storage/follows";
import {
  getBillingStatus,
  openProCheckout,
  openProLogin,
  startBillingBackground,
} from "@/src/billing/extpay";
import { requirePro, runProAction } from "@/src/billing/entitlements";
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
import { setUsageConsent } from "@/src/telemetry/usage";

type AuditTarget = {
  tabId: number;
  url: string;
  domain: string;
};

let recentAuditTarget: AuditTarget | null = null;
const runningAudits = new Map<number, Promise<void>>();
const automaticScanTimers = new Map<number, ReturnType<typeof setTimeout>>();
const automaticScansInFlight = new Set<string>();
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

export default defineBackground(() => {
  startBillingBackground();
  installRequestCapture();
  void installWatchedSiteSchedule().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Could not initialize watched-site schedule",
    );
  });
  void refreshActiveTabBadge();
  void browser.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      const target = tab ? auditTargetFromTab(tab) : null;
      if (target) recentAuditTarget = target;
    })
    .catch(() => undefined);

  browser.commands.onCommand.addListener((command) => {
    if (command !== "scan-active-tab") return;
    void getBillingStatus()
      .then((billing) => scanActiveTab({ extendedHistory: billing.paid }))
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : "Scan failed");
      });
  });

  if (browser.tabs?.onActivated) {
    browser.tabs.onActivated.addListener((info) => {
      void rememberAuditTarget(info.tabId);
      void browser.tabs
        .get(info.tabId)
        .then((tab) => {
          void applyBadgeForUrl(tab.url, tab.id);
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
      void applyBadgeForUrl(tab.url, tab.id);
      if (changeInfo.status === "complete")
        scheduleAutomaticScan(_tabId, tab.url);
    });
  }

  browser.tabs.onRemoved.addListener((tabId) => {
    cancelAutomaticScan(tabId);
    forgetActionState(tabId);
  });
  browser.permissions.onRemoved.addListener(() => {
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
    if (alarm.name === WATCHED_SITE_ALARM) {
      void runDueWatchedSites()
        .then(() => deliverPendingNotifications())
        .then(() => maybeNotifyWeeklyDigest())
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
        .then(() => sendResponse({ ok: true }))
        .catch(() =>
          sendResponse({ ok: false, error: "Could not update usage consent." }),
        );
      return true;
    }
    if (message?.type === "SCAN_ACTIVE_TAB") {
      void getBillingStatus()
        .then((billing) =>
          scanActiveTab({
            extendedHistory: billing.paid,
            onProgress: progressReporter(message.requestId),
          }),
        )
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
        extendedHistory: false,
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
      }
      void task
        .then(() => sendResponse({ ok: true, auditId }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Audit failed",
          }),
        );
      return true;
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
            watchActiveTab(undefined, true),
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
                : "Could not check subscription",
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
      void Promise.all([listWatchedSites(), getBillingStatus()])
        .then(async ([sites, billing]) => {
          const target = normalizeWatchedSiteUrl(url);
          requirePro(billing, "scheduled-checks");
          const site = await addWatchedSite(url, schedule);
          const scanId =
            schedule === "visit" ? undefined : await runWatchedSite(site);
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
          requirePro(billing, "scheduled-checks");
          if (
            message.alertMode === "important" ||
            message.alertMode === "all" ||
            message.alertMode === "never"
          )
            return updateWatchedSiteAlertMode(domain, message.alertMode);
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
      void removeWatchedSite(domain)
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
