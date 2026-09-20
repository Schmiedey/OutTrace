import { db } from "@/src/storage/database";
import { activityImportance } from "@/src/analysis/changeImportance";
import type {
  AlertRow,
  ScanRow,
  SiteRow,
  WatchedSiteRow,
} from "@/src/types/graph";

export function summarizePortfolio(
  sites: SiteRow[],
  scans: ScanRow[],
  watches: WatchedSiteRow[],
  alerts: AlertRow[],
) {
  const latest = new Map<string, ScanRow>();
  for (const scan of scans) {
    if (scan.timestamp > (latest.get(scan.domain)?.timestamp ?? -1))
      latest.set(scan.domain, scan);
  }
  const watched = new Map(watches.map((row) => [row.domain, row]));
  const pending = new Map<string, AlertRow[]>();
  for (const alert of alerts) {
    if (alert.read || activityImportance(alert) === "routine") continue;
    pending.set(alert.siteDomain, [
      ...(pending.get(alert.siteDomain) ?? []),
      alert,
    ]);
  }
  const domains = new Set([
    ...sites.map((site) => site.domain),
    ...watches.map((site) => site.domain),
  ]);
  const siteMap = new Map(sites.map((site) => [site.domain, site]));
  return Array.from(domains, (domain) => ({
    domain,
    site: siteMap.get(domain),
    latest: latest.get(domain),
    watch: watched.get(domain),
    pending: (pending.get(domain) ?? []).sort(
      (a, b) => b.timestamp - a.timestamp,
    ),
  })).sort(
    (a, b) =>
      b.pending.length - a.pending.length || a.domain.localeCompare(b.domain),
  );
}

export async function getPortfolio() {
  const [sites, scans, watches, alerts] = await Promise.all([
    db.sites.toArray(),
    db.scans.toArray(),
    db.watchedSites.toArray(),
    db.alerts.toArray(),
  ]);
  return summarizePortfolio(sites, scans, watches, alerts);
}
