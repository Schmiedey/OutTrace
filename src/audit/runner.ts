import { discoverPayloadLinks, discoverSitemapUrls } from "@/src/audit/discovery";
import type { AuditProgress } from "@/src/audit/types";
import { prioritizeAuditUrls } from "@/src/audit/url";
import { startRequestCapture, stopRequestCapture } from "@/src/extension/requestLog";
import { injectCollector, withCapturedRequests } from "@/src/extension/scanFlow";
import {
  auditProgress,
  cancelAudit,
  completeAudit,
  failAudit,
  getAudit,
  listAuditPages,
  persistAuditPage,
  recordAuditPageFailure,
  setAuditCurrentPage,
  setAuditDiscovery,
} from "@/src/storage/audits";
import { getBillingStatus } from "@/src/billing/extpay";
import { requirePro } from "@/src/billing/entitlements";
import { claimFreeDeepAudit } from "@/src/storage/settings";

type AuditRunnerOptions = {
  onProgress?: (progress: AuditProgress) => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function navigateAndWait(tabId: number, url: string, timeoutMs = 20_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("Page load timed out."));
    }, timeoutMs);
    const listener = (updatedId: number, change: { status?: string }): void => {
      if (updatedId !== tabId || change.status !== "complete") return;
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    browser.tabs.onUpdated.addListener(listener);
    browser.tabs.update(tabId, { url, active: false }).catch((error: unknown) => {
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      reject(error);
    });
  });
}

async function emitProgress(auditId: number, recent: string[], callback?: AuditRunnerOptions["onProgress"]): Promise<void> {
  if (!callback) return;
  const progress = await auditProgress(auditId, recent.slice(-5).reverse());
  if (progress) callback(progress);
}

export async function runAudit(auditId: number, options: AuditRunnerOptions = {}): Promise<void> {
  const audit = await getAudit(auditId);
  if (!audit) throw new Error("Audit not found.");
  const discovered = new Set<string>([audit.rootUrl]);
  const existingPages = await listAuditPages(auditId);
  const attempted = new Set(existingPages.filter((page) => page.status === "completed").map((page) => page.url));
  const recent: string[] = [];
  let tabId: number | undefined;

  try {
    if (audit.mode === "deep") {
      const billing = await getBillingStatus();
      if (!billing.paid && !(await claimFreeDeepAudit())) requirePro(billing, "deep-audit");
    }
    // Open the reusable audit tab before optional sitemap discovery. A slow or
    // non-responsive robots.txt must never prevent the root page from being
    // checked and shown as progress.
    const tab = await browser.tabs.create({ url: "about:blank", active: false });
    if (tab.id === undefined) throw new Error("Could not create the audit tab.");
    tabId = tab.id;
    await setAuditDiscovery(auditId, discovered.size);
    await emitProgress(auditId, recent, options.onProgress);

    const sitemapPromise = discoverSitemapUrls(audit.rootUrl, audit.maxPages * 20);
    let sitemapApplied = false;

    while (attempted.size < audit.maxPages) {
      const latest = await getAudit(auditId);
      if (!latest || latest.status === "cancelled") break;
      // Let the first iteration scan the root immediately. If more pages are
      // needed, fold in any sitemap results before selecting the next one.
      if (!sitemapApplied && attempted.size > 0) {
        const sitemapUrls = await sitemapPromise;
        for (const url of sitemapUrls) discovered.add(url);
        sitemapApplied = true;
        await setAuditDiscovery(auditId, discovered.size);
      }
      const prioritized = prioritizeAuditUrls(discovered, audit.rootUrl, audit.maxPages);
      const url = prioritized.find((candidate) => !attempted.has(candidate));
      if (!url) break;
      attempted.add(url);
      await setAuditCurrentPage(auditId, url, discovered.size);
      await emitProgress(auditId, recent, options.onProgress);

      startRequestCapture(tabId);
      try {
        await navigateAndWait(tabId, url);
        await delay(audit.waitMs);
        const current = await getAudit(auditId);
        if (!current || current.status === "cancelled") {
          stopRequestCapture(tabId);
          break;
        }
        const raw = withCapturedRequests(await injectCollector(tabId, audit.mode === "deep"), tabId);
        const newlyFound = await persistAuditPage(auditId, raw);
        recent.push(...newlyFound);
        for (const link of discoverPayloadLinks(raw, audit.rootUrl)) discovered.add(link);
        await setAuditDiscovery(auditId, discovered.size);
      } catch (error) {
        stopRequestCapture(tabId);
        await recordAuditPageFailure(
          auditId,
          url,
          error instanceof Error ? error.message : "Page scan failed.",
        );
      }
      await emitProgress(auditId, recent, options.onProgress);
    }

    const latest = await getAudit(auditId);
    if (latest?.status === "cancelled") return;
    const pages = await listAuditPages(auditId);
    if (!pages.some((page) => page.status === "completed")) {
      throw new Error("No pages could be audited.");
    }
    await completeAudit(auditId);
    await emitProgress(auditId, recent, options.onProgress);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed.";
    await failAudit(auditId, message);
    await emitProgress(auditId, recent, options.onProgress);
    throw error;
  } finally {
    if (tabId !== undefined) {
      try {
        await browser.tabs.remove(tabId);
      } catch {
        // The user may have closed the reusable audit tab.
      }
    }
  }
}

export async function requestAuditCancellation(auditId: number): Promise<void> {
  await cancelAudit(auditId);
}
