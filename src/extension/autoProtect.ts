import { getLatestScanForSite, getSiteByDomain } from "@/src/storage/scans";
import { automaticProtectionEnabled } from "@/src/storage/settings";
import { canScanUrl } from "@/src/extension/permissions";
import { registrableDomain } from "@/src/lib/domain";

export const AUTO_SCAN_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const AUTO_SCAN_DWELL_MS = 6_000;

export function automaticScanIsDue(lastScanAt: number | undefined, now = Date.now()): boolean {
  return lastScanAt === undefined || now - lastScanAt >= AUTO_SCAN_COOLDOWN_MS;
}

export async function shouldAutomaticallyScan(url: string, now = Date.now()): Promise<boolean> {
  if (!canScanUrl(url) || !(await automaticProtectionEnabled())) return false;
  const domain = registrableDomain(url) ?? new URL(url).hostname;
  const site = await getSiteByDomain(domain);
  if (site?.id === undefined) return true;
  const latest = await getLatestScanForSite(site.id);
  return automaticScanIsDue(latest?.timestamp, now);
}
