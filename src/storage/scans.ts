import { scoreSnapshot } from "@/src/analysis/score";
import { normalizeScan } from "@/src/extension/normalize";
import { notifyFollowedSeen, recordScanAlert } from "@/src/storage/alerts";
import { exportArchive } from "@/src/storage/archive";
import { db } from "@/src/storage/database";
import { listFollowedDomains } from "@/src/storage/follows";
import { pruneSnapshots } from "@/src/storage/retention";
import type {
  CaptureMode,
  ConnectionType,
  DomainRow,
  GraphEdgeRecord,
  GraphNodeRecord,
  RawScanPayload,
  ScanGraphRow,
  ScanGraphSnapshot,
  ScanRow,
  SightingRow,
  SiteRow,
} from "@/src/types/graph";

export type PersistScanOptions = {
  captureMode?: CaptureMode;
  durationMs?: number;
  extendedHistory?: boolean;
  watchedSite?: boolean;
};

export async function persistScan(raw: RawScanPayload, options: PersistScanOptions = {}): Promise<number> {
  const normalized = normalizeScan(raw);
  const scored = scoreSnapshot({ scanId: 0, originDomain: normalized.originDomain, nodes: normalized.snapshot.nodes, edges: normalized.snapshot.edges });
  const now = Date.now();
  const existingSite = await db.sites.where("domain").equals(normalized.originDomain).first();
  const previous = existingSite?.id !== undefined ? await getLatestScanForSite(existingSite.id) : undefined;
  const previousGraph = previous?.id !== undefined ? await getScanGraph(previous.id) : undefined;

  const followed = new Set(await listFollowedDomains());
  const watched = options.watchedSite ?? Boolean(await db.watchedSites.get(normalized.originDomain));
  const newFollowHits: string[] = [];

  const scanId = await db.transaction("rw", db.sites, db.scans, db.scanGraphs, db.domains, db.sightings, async () => {
    let site = await db.sites.where("domain").equals(normalized.originDomain).first();
    if (site?.id !== undefined) {
      await db.sites.update(site.id, {
        lastSeen: now,
        scanCount: site.scanCount + 1,
      });
    } else {
      const siteId = await db.sites.add({
        domain: normalized.originDomain,
        firstSeen: now,
        lastSeen: now,
        scanCount: 1,
      });
      site = {
        id: siteId,
        domain: normalized.originDomain,
        firstSeen: now,
        lastSeen: now,
        scanCount: 1,
      };
    }

    const siteId = site.id;
    if (siteId === undefined) {
      throw new Error("Failed to save site.");
    }

    const scanId = await db.scans.add({
      siteId,
      url: raw.url,
      title: raw.title,
      domain: normalized.originDomain,
      timestamp: now,
      nodeCount: normalized.snapshot.nodes.length,
      edgeCount: normalized.snapshot.edges.length,
      thirdPartyCount: normalized.thirdPartyCount,
      trackerCount: normalized.trackerCount,
      captureMode: options.captureMode ?? "snapshot",
      durationMs: options.durationMs,
      privacyScore: scored.score,
      unknownCount: scored.unknown,
      iframeCount: scored.iframeCount,
    });

    await db.scanGraphs.put({
      scanId,
      originDomain: normalized.originDomain,
      nodes: normalized.snapshot.nodes,
      edges: normalized.snapshot.edges,
    });

    for (const node of normalized.snapshot.nodes) {
      const types = Array.from(
        new Set(
          normalized.snapshot.edges
            .filter((edge) => edge.target === node.domain || edge.source === node.domain)
            .map((edge) => edge.type),
        ),
      );

      const existingDomain = await db.domains.get(node.domain);
      if (existingDomain) {
        const next: DomainRow = {
          ...existingDomain,
          lastSeen: now,
          referenceCount: existingDomain.referenceCount + node.referenceCount,
          category: existingDomain.category === "unknown" ? node.category : existingDomain.category,
        };
        if (node.category !== "origin" && existingDomain.category === "origin") {
          next.category = node.category;
        }
        await db.domains.put(next);
      } else {
        await db.domains.put({
          domain: node.domain,
          category: node.category === "origin" ? "unknown" : node.category,
          firstSeen: now,
          lastSeen: now,
          seenOnCount: 0,
          referenceCount: node.referenceCount,
        });
      }

      if (node.isOrigin) continue;

      const existingSighting = await db.sightings
        .where("[domain+siteId]")
        .equals([node.domain, siteId])
        .first();

      if (existingSighting?.id !== undefined) {
        const mergedTypes = Array.from(new Set([...existingSighting.types, ...types]));
        await db.sightings.update(existingSighting.id, {
          types: mergedTypes,
          lastScanId: scanId,
          lastSeen: now,
        });
      } else {
        const sighting: SightingRow = {
          domain: node.domain,
          siteId,
          siteDomain: normalized.originDomain,
          types,
          lastScanId: scanId,
          lastSeen: now,
        };
        await db.sightings.add(sighting);
        if (followed.has(node.domain)) newFollowHits.push(node.domain);
        const domainRow = await db.domains.get(node.domain);
        if (domainRow) {
          await db.domains.put({
            ...domainRow,
            seenOnCount: domainRow.seenOnCount + 1,
          });
        }
      }
    }

    return scanId;
  });

  const next = await getScan(scanId);
  const nextGraph = await getScanGraph(scanId);
  if (next && nextGraph) {
    await recordScanAlert(previous, next, nextGraph, previousGraph, watched);
    if (newFollowHits.length > 0) {
      await notifyFollowedSeen({
        domain: next.domain,
        scanId,
        followed: newFollowHits,
      });
    }
  }
  await pruneSnapshots(Date.now(), options.extendedHistory);

  return scanId;
}

export async function getScan(scanId: number): Promise<ScanRow | undefined> {
  return await db.scans.get(scanId);
}

export async function getScanGraph(scanId: number): Promise<ScanGraphSnapshot | undefined> {
  const row = await db.scanGraphs.get(scanId);
  if (!row) return undefined;
  return {
    scanId: row.scanId,
    originDomain: row.originDomain,
    nodes: row.nodes,
    edges: row.edges,
  };
}

export async function listRecentScans(limit = 40): Promise<ScanRow[]> {
  return await db.scans.orderBy("timestamp").reverse().limit(limit).toArray();
}

export async function listScansForSite(siteId: number): Promise<ScanRow[]> {
  return await db.scans.where("siteId").equals(siteId).reverse().sortBy("timestamp");
}

export async function listSites(): Promise<SiteRow[]> {
  return await db.sites.orderBy("lastSeen").reverse().toArray();
}

export async function getSiteByDomain(domain: string): Promise<SiteRow | undefined> {
  return await db.sites.where("domain").equals(domain).first();
}

export async function getSite(siteId: number): Promise<SiteRow | undefined> {
  return await db.sites.get(siteId);
}

export async function getLatestScanForSite(siteId: number): Promise<ScanRow | undefined> {
  const scans = await listScansForSite(siteId);
  return scans[0];
}

export async function listLatestScans(): Promise<ScanRow[]> {
  const scans = await db.scans.orderBy("timestamp").reverse().toArray();
  const seen = new Set<number>();
  const latest: ScanRow[] = [];
  for (const scan of scans) {
    if (seen.has(scan.siteId)) continue;
    seen.add(scan.siteId);
    latest.push(scan);
  }
  return latest;
}

export async function listLatestGraphs(): Promise<ScanGraphSnapshot[]> {
  const latest = await listLatestScans();
  const graphs: ScanGraphSnapshot[] = [];
  for (const scan of latest) {
    if (scan.id === undefined) continue;
    const graph = await getScanGraph(scan.id);
    if (graph) graphs.push(graph);
  }
  return graphs;
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.sites,
      db.scans,
      db.scanGraphs,
      db.domains,
      db.sightings,
      db.alerts,
      db.audits,
      db.auditPages,
      db.auditPageGraphs,
      db.auditDomains,
      db.watchedSites,
    ],
    async () => {
      await Promise.all([
        db.sites.clear(),
        db.scans.clear(),
        db.scanGraphs.clear(),
        db.domains.clear(),
        db.sightings.clear(),
        db.alerts.clear(),
        db.audits.clear(),
        db.auditPages.clear(),
        db.auditPageGraphs.clear(),
        db.auditDomains.clear(),
        db.watchedSites.clear(),
      ]);
    },
  );
}

export async function getOverviewStats(): Promise<{
  sites: number;
  domains: number;
  connections: number;
  trackers: number;
  scansThisMonth: number;
}> {
  const [sites, domains, scans] = await Promise.all([
    db.sites.count(),
    db.domains.count(),
    db.scans.toArray(),
  ]);
  const connections = scans.reduce((sum, scan) => sum + scan.edgeCount, 0);
  const trackerRows = await db.domains
    .filter((row) => row.category === "analytics" || row.category === "advertising" || row.category === "telemetry")
    .count();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const scansThisMonth = scans.filter((scan) => scan.timestamp >= startOfMonth.getTime()).length;

  return {
    sites,
    domains,
    connections,
    trackers: trackerRows,
    scansThisMonth,
  };
}

export function mergeSnapshots(
  graphs: ScanGraphSnapshot[],
  siteDomains: Set<string>,
): { nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] } {
  const nodes = new Map<string, GraphNodeRecord>();
  const edges = new Map<string, GraphEdgeRecord>();

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      const existing = nodes.get(node.domain);
      const isSite = siteDomains.has(node.domain);
      if (!existing) {
        nodes.set(node.domain, {
          ...node,
          isOrigin: isSite,
          isSite,
          isFirstParty: Boolean(node.isFirstParty),
          category: node.category === "origin" ? (isSite ? "origin" : node.category) : node.category,
        });
      } else {
        const hostnames = new Set([...existing.hostnames, ...node.hostnames]);
        existing.referenceCount += node.referenceCount;
        existing.hostnames = Array.from(hostnames).sort();
        existing.isSite = existing.isSite || isSite;
        existing.isOrigin = existing.isSite;
      }
    }

    for (const edge of graph.edges) {
      const existing = edges.get(edge.id);
      if (!existing) {
        edges.set(edge.id, { ...edge, evidence: edge.evidence.slice(0, 8) });
      } else {
        existing.count += edge.count;
        const urls = new Set(existing.evidence.map((item) => item.url));
        for (const item of edge.evidence) {
          if (existing.evidence.length >= 8) break;
          if (!urls.has(item.url)) {
            existing.evidence.push(item);
            urls.add(item.url);
          }
        }
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
}

export type GlobalGraphOptions = {
  minSeenOn: number;
  types?: ConnectionType[] | "all";
  maxNodes?: number;
};

export async function getGlobalSnapshot(
  options: GlobalGraphOptions,
): Promise<ScanGraphSnapshot & { truncated: boolean; totalNodes: number }> {
  const maxNodes = options.maxNodes ?? 2000;
  const [graphs, sites, domainRows] = await Promise.all([
    db.scanGraphs.toArray(),
    db.sites.toArray(),
    db.domains.toArray(),
  ]);

  const siteDomains = new Set(sites.map((site) => site.domain));
  const seenOn = new Map(domainRows.map((row) => [row.domain, row.seenOnCount] as const));
  const snapshots: ScanGraphSnapshot[] = graphs.map((row) => ({
    scanId: row.scanId,
    originDomain: row.originDomain,
    nodes: row.nodes,
    edges: row.edges,
  }));

  const merged = mergeSnapshots(snapshots, siteDomains);
  let nodes = merged.nodes.filter((node) => {
    if (node.isSite) return true;
    return (seenOn.get(node.domain) ?? 1) >= options.minSeenOn;
  });

  const allowed = new Set(nodes.map((node) => node.domain));
  let edges = merged.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));

  if (options.types && options.types !== "all") {
    const typeSet = new Set(options.types);
    edges = edges.filter((edge) => typeSet.has(edge.type));
    const connected = new Set<string>();
    for (const edge of edges) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
    nodes = nodes.filter((node) => node.isSite || connected.has(node.domain));
  }

  const totalNodes = nodes.length;
  let truncated = false;
  if (nodes.length > maxNodes) {
    truncated = true;
    nodes = [...nodes]
      .sort((a, b) => {
        if (a.isSite !== b.isSite) return a.isSite ? -1 : 1;
        return b.referenceCount - a.referenceCount;
      })
      .slice(0, maxNodes);
    const keep = new Set(nodes.map((node) => node.domain));
    edges = edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
  }

  return {
    scanId: 0,
    originDomain: "global",
    nodes,
    edges,
    truncated,
    totalNodes,
  };
}

export async function exportAllData(): Promise<{
  exportedAt: string;
  sites: SiteRow[];
  scans: ScanRow[];
  graphs: ScanGraphRow[];
  domains: DomainRow[];
  sightings: SightingRow[];
}> {
  return await exportArchive();
}
