import { applyBadgeForUrl, refreshActiveTabBadge } from "@/src/extension/badge";
import { canScanUrl } from "@/src/extension/permissions";
import { installRequestCapture } from "@/src/extension/requestLog";
import { runAudit, requestAuditCancellation } from "@/src/audit/runner";
import { openDashboard, scanActiveTab, watchActiveTab } from "@/src/extension/scanFlow";
import { blockDomain } from "@/src/extension/block";
import type { ScanProgressUpdate } from "@/src/extension/scanProgress";
import { maybeNotifyWeeklyDigest } from "@/src/storage/alerts";
import { registrableDomain } from "@/src/lib/domain";
import { toggleFollowDomain } from "@/src/storage/follows";
import { getBillingStatus, openProCheckout, openProLogin, startBillingBackground } from "@/src/billing/extpay";
import { installWatchedSiteSchedule, runDueWatchedSites, runWatchedSite, WATCHED_SITE_ALARM } from "@/src/extension/watchedSites";
import {
  addWatchedSite,
  listWatchedSites,
  normalizeWatchedSiteUrl,
  removeWatchedSite,
  updateWatchedSiteSchedule,
} from "@/src/storage/watchedSites";
import type { WatchedSiteSchedule } from "@/src/types/graph";

type AuditTarget = {
  tabId: number;
  url: string;
  domain: string;
};

let recentAuditTarget: AuditTarget | null = null;
const runningAudits = new Map<number, Promise<void>>();

function auditTargetFromTab(tab: { id?: number; url?: string }): AuditTarget | null {
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
      const current = auditTargetFromTab(await browser.tabs.get(recentAuditTarget.tabId));
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
      lastAccessed: (tab as typeof tab & { lastAccessed?: number }).lastAccessed ?? 0,
    }))
    .filter((row): row is { target: AuditTarget; lastAccessed: number } => Boolean(row.target))
    .sort((a, b) => b.lastAccessed - a.lastAccessed);
  recentAuditTarget = targets[0]?.target ?? null;
  return recentAuditTarget;
}

function progressReporter(requestId: unknown): ((update: ScanProgressUpdate) => void) | undefined {
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
    console.error(error instanceof Error ? error.message : "Could not initialize watched-site schedule");
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
        .then((tab) => applyBadgeForUrl(tab.url))
        .catch(() => undefined);
    });
  }
  if (browser.tabs?.onUpdated) {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (!tab.active) return;
      const target = auditTargetFromTab(tab);
      if (target) recentAuditTarget = target;
      if (changeInfo.status !== "complete" && !changeInfo.url) return;
      void applyBadgeForUrl(tab.url);
    });
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
      const match = /^linkscope-diff-(\d+)-(\d+)$/.exec(notificationId);
      if (!match) {
        void openDashboard();
        return;
      }
      const url = browser.runtime.getURL(`/app.html#/diff/${match[1]}/${match[2]}`);
      void browser.tabs.create({ url });
    });
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WATCHED_SITE_ALARM) {
      void runDueWatchedSites().then(() => maybeNotifyWeeklyDigest());
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCAN_ACTIVE_TAB") {
      void getBillingStatus()
        .then((billing) => scanActiveTab({ extendedHistory: billing.paid, onProgress: progressReporter(message.requestId) }))
        .then((scanId) => sendResponse({ ok: true, scanId }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Scan failed",
          }),
        );
      return true;
    }

    if (message?.type === "SCAN_QUIET") {
      const tabId = typeof message.tabId === "number" ? message.tabId : undefined;
      const url = typeof message.url === "string" ? message.url : undefined;
      void getBillingStatus()
        .then((billing) => scanActiveTab({
          openReport: false,
          tabId,
          url,
          notifyIfNew: false,
          force: true,
          extendedHistory: billing.paid,
          onProgress: progressReporter(message.requestId),
        }))
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
            error: error instanceof Error ? error.message : "Could not find a site to audit",
          }),
        );
      return true;
    }

    if (message?.type === "RUN_SITE_AUDIT") {
      const auditId = typeof message.auditId === "number" ? message.auditId : NaN;
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      let task = runningAudits.get(auditId);
      if (!task) {
        task = runAudit(auditId, {
          onProgress: (progress) => {
            void browser.runtime.sendMessage({ type: "AUDIT_PROGRESS", requestId, progress }).catch(() => undefined);
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
      const auditId = typeof message.auditId === "number" ? message.auditId : NaN;
      void requestAuditCancellation(auditId)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not stop audit" }),
        );
      return true;
    }

    if (message?.type === "WATCH_ACTIVE_TAB") {
      void getBillingStatus()
        .then((status) => {
          if (!status.paid) throw new Error("The 15-second deep scan is a Pro feature.");
          void watchActiveTab(undefined, true).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : "Watch failed");
          });
          sendResponse({ ok: true });
        })
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Watch failed" }),
        );
      return true;
    }

    if (message?.type === "GET_BILLING_STATUS") {
      void getBillingStatus(Boolean(message.force))
        .then((status) => sendResponse({ ok: true, status }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not check subscription" }),
        );
      return true;
    }

    if (message?.type === "OPEN_PRO_CHECKOUT" || message?.type === "OPEN_PRO_LOGIN") {
      const action = message.type === "OPEN_PRO_CHECKOUT" ? openProCheckout : openProLogin;
      void action()
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not open billing" }),
        );
      return true;
    }

    if (message?.type === "LIST_WATCHED_SITES") {
      void Promise.all([listWatchedSites(), getBillingStatus()])
        .then(([sites, billing]) => sendResponse({ ok: true, sites, billing }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load watched sites" }),
        );
      return true;
    }

    if (message?.type === "ADD_WATCHED_SITE") {
      const url = typeof message.url === "string" ? message.url : "";
      const schedule: WatchedSiteSchedule = message.schedule === "weekly" ? "weekly" : "daily";
      void Promise.all([listWatchedSites(), getBillingStatus()])
        .then(async ([sites, billing]) => {
          const target = normalizeWatchedSiteUrl(url);
          if (!billing.paid && sites.length >= 1 && !sites.some((site) => site.domain === target.domain)) {
            throw new Error("Free includes one watched site. Upgrade to Pro for unlimited sites.");
          }
          const site = await addWatchedSite(url, schedule);
          const scanId = await runWatchedSite(site);
          sendResponse({ ok: true, site: { ...site, lastScanId: scanId } });
        })
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not add watched site" }),
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
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not scan watched site" }),
        );
      return true;
    }

    if (message?.type === "UPDATE_WATCHED_SITE") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      const schedule: WatchedSiteSchedule = message.schedule === "weekly" ? "weekly" : "daily";
      void getBillingStatus()
        .then((billing) => {
          if (!billing.paid) throw new Error("Scheduled background checks require LinkScope Pro.");
          return updateWatchedSiteSchedule(domain, schedule);
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not update schedule" }),
        );
      return true;
    }

    if (message?.type === "REMOVE_WATCHED_SITE") {
      const domain = typeof message.domain === "string" ? message.domain : "";
      void removeWatchedSite(domain)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not remove watched site" }),
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
            error: error instanceof Error ? error.message : "Could not open dashboard",
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
            error: error instanceof Error ? error.message : "Could not follow domain",
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
            error: error instanceof Error ? error.message : "Could not block domain",
          }),
        );
      return true;
    }

    return false;
  });
});
