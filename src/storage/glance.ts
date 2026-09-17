import { db } from "@/src/storage/database";
import { getScanGraph, getSiteByDomain, listScansForSite, listSites } from "@/src/storage/scans";
import type { DomainRow, ScanGraphSnapshot, ScanRow, SiteRow } from "@/src/types/graph";
import type { AlertRow } from "@/src/types/graph";

export type SiteGlance = {
  site: SiteRow;
  latest: ScanRow;
  previous?: ScanRow;
  latestGraph?: ScanGraphSnapshot;
  previousGraph?: ScanGraphSnapshot;
  siteCount: number;
  watched: boolean;
  activity: AlertRow[];
};

export async function getSiteGlance(domain: string): Promise<SiteGlance | null> {
  const site = await getSiteByDomain(domain);
  if (site?.id === undefined) return null;
  const scans = [...(await listScansForSite(site.id))].sort((a, b) => b.timestamp - a.timestamp);
  const latest = scans[0];
  if (!latest) return null;
  const previous = scans[1];
  const [latestGraph, previousGraph, sites, watched, activity] = await Promise.all([
    latest.id !== undefined ? getScanGraph(latest.id) : Promise.resolve(undefined),
    previous?.id !== undefined ? getScanGraph(previous.id) : Promise.resolve(undefined),
    listSites(),
    db.watchedSites.get(domain),
    db.alerts.where("siteId").equals(site.id).filter((alert) => !alert.read && alert.toScanId <= (latest.id ?? 0)).toArray(),
  ]);
  return {
    site,
    latest,
    previous,
    latestGraph,
    previousGraph,
    siteCount: sites.length,
    watched: Boolean(watched?.enabled),
    activity,
  };
}

export async function domainRowsForSnapshot(snapshot: ScanGraphSnapshot | undefined): Promise<DomainRow[]> {
  if (!snapshot) return [];
  const domains = snapshot.nodes.filter((node) => !node.isOrigin).map((node) => node.domain);
  const rows = await db.domains.bulkGet(domains);
  return rows.filter((row): row is DomainRow => Boolean(row));
}
