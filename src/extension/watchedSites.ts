import { getBillingStatus } from "@/src/billing/extpay";
import { scanActiveTab } from "@/src/extension/scanFlow";
import {
  listDueWatchedSites,
  listWatchedSites,
  recordWatchedSiteResult,
} from "@/src/storage/watchedSites";
import type { WatchedSiteRow } from "@/src/types/graph";

export const WATCHED_SITE_ALARM = "linkscope-watched-sites";

async function navigateAndWait(tabId: number, url: string, timeoutMs = 30_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("The watched site took too long to load."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId !== tabId || change.status !== "complete") return;
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs.update(tabId, { url, active: false }).catch((error: unknown) => {
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      reject(error);
    });
  });
}

export async function runWatchedSite(site: WatchedSiteRow): Promise<number> {
  const origin = new URL(site.url).origin;
  const billing = await getBillingStatus();
  const requiredOrigins = billing.paid ? ["*://*/*"] : [`${origin}/*`];
  const allowed = await browser.permissions.contains({ origins: requiredOrigins });
  if (!allowed) throw new Error("Site access was removed. Add this site again to restore it.");
  let tabId: number | undefined;
  try {
    const tab = await browser.tabs.create({ url: "about:blank", active: false });
    if (tab.id === undefined) throw new Error("Could not create a background scan tab.");
    tabId = tab.id;
    await navigateAndWait(tabId, site.url);
    const current = await browser.tabs.get(tabId);
    if (!current.url) throw new Error("The watched site did not return a URL.");
    const scanId = await scanActiveTab({
      tabId,
      url: current.url,
      openReport: false,
      notifyIfNew: false,
      force: true,
      captureMode: billing.paid ? "scheduled" : "snapshot",
      watchedSite: billing.paid,
      extendedHistory: billing.paid,
      allFrames: true,
    });
    await recordWatchedSiteResult(site.domain, site.schedule, { scanId });
    return scanId;
  } catch (error) {
    await recordWatchedSiteResult(site.domain, site.schedule, {
      error: error instanceof Error ? error.message : "Scheduled scan failed.",
    });
    throw error;
  } finally {
    if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => undefined);
  }
}

export async function runDueWatchedSites(): Promise<void> {
  // A free account may keep one baseline site and check it manually, but only
  // Pro accounts receive scheduled background re-scans and change alerts.
  if (!(await getBillingStatus()).paid) return;
  const due = await listDueWatchedSites();
  for (const site of due) {
    await runWatchedSite(site).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Watched-site scan failed");
    });
  }
}

export async function installWatchedSiteSchedule(): Promise<void> {
  await browser.alarms.create(WATCHED_SITE_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
  const sites = await listWatchedSites();
  if (sites.some((site) => site.enabled && site.nextRunAt <= Date.now())) void runDueWatchedSites();
}
