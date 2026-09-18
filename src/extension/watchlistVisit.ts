import { diffSnapshots } from "@/src/analysis/diff";
import { setWatchlistBadge } from "@/src/extension/badge";
import { scanActiveTab } from "@/src/extension/scanFlow";
import { getLatestScanForSite, getScan, getScanGraph, getSiteByDomain } from "@/src/storage/scans";
import { isWatchedSite } from "@/src/storage/watchedSites";
import { registrableDomain } from "@/src/lib/domain";

/** Scan only a user-approved watched origin after a completed user navigation. */
export async function scanWatchedVisit(tabId: number, url: string): Promise<number> {
  const domain = registrableDomain(url) ?? new URL(url).hostname;
  if (!(await isWatchedSite(domain, true))) return 0;
  const site = await getSiteByDomain(domain);
  const previous = site?.id === undefined ? undefined : await getLatestScanForSite(site.id);
  const previousGraph = previous?.id === undefined ? undefined : await getScanGraph(previous.id);
  const scanId = await scanActiveTab({
    tabId,
    url,
    openReport: false,
    notifyIfNew: false,
    captureMode: "snapshot",
    watchedSite: true,
    allFrames: false,
  });
  const [next, nextGraph] = await Promise.all([getScan(scanId), getScanGraph(scanId)]);
  if (!previous || !previousGraph || !next || !nextGraph) return 0;
  const newDomains = diffSnapshots(previous, next, previousGraph, nextGraph).added
    .filter((node) => !node.isFirstParty && !node.isOrigin).length;
  if (newDomains) await setWatchlistBadge(tabId, newDomains);
  return newDomains;
}
