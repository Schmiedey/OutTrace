import { getLatestScanForSite, getSiteByDomain } from "@/src/storage/scans";
import {
  automaticProtectionEnabled,
  isDomainIgnored,
} from "@/src/storage/settings";
import { canScanUrl } from "@/src/extension/permissions";
import { registrableDomain } from "@/src/lib/domain";
import { db } from "@/src/storage/database";
export const AUTO_SCAN_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const AUTO_SCAN_DWELL_MS = 6_000;
export function automaticScanIsDue(
  lastScanAt: number | undefined,
  now = Date.now(),
): boolean {
  return lastScanAt === undefined || now - lastScanAt >= AUTO_SCAN_COOLDOWN_MS;
}
export async function shouldAutomaticallyScan(
  url: string,
  now = Date.now(),
): Promise<boolean> {
  if (!canScanUrl(url)) return false;
  const domain = registrableDomain(url) ?? new URL(url).hostname;
  const watched = await db.watchedSites.get(domain);
  const visitWatch = Boolean(watched?.enabled && watched.schedule === "visit");
  const quietProtection = await automaticProtectionEnabled();
  if (!quietProtection && !visitWatch) return false;
  if (await isDomainIgnored(domain)) return false;
  if (!(await browser.permissions.contains({ origins: ["*://*/*"] })))
    return false;
  if (visitWatch && !quietProtection) {
    const { getBillingStatus } = await import("@/src/billing/extpay");
    if (!(await getBillingStatus()).paid) return false;
  }
  const site = await getSiteByDomain(domain);
  // A first-ever page is never audited implicitly. Establish the local
  // baseline with the explicit “Check this page” action first; protection can
  // then quietly re-check that known site on later visits.
  if (!site?.id) return false;
  const latest =
    await getLatestScanForSite(site.id);
  if (!latest) return false;
  return automaticScanIsDue(latest?.timestamp, now);
}
