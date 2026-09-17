import { LIST_ATTRIBUTION } from "@/src/analysis/categorizer";
import { scoreSnapshot } from "@/src/analysis/score";
import { db } from "@/src/storage/database";
import type {
  ConnectionType,
  DomainRow,
  GraphEdgeRecord,
  GraphNodeRecord,
  ScanGraphRow,
  ScanRow,
  SightingRow,
  SiteRow,
} from "@/src/types/graph";

export type ArchivePayload = {
  formatVersion?: 1;
  exportedAt: string;
  list?: { source?: string };
  sites: SiteRow[];
  scans: ScanRow[];
  graphs: ScanGraphRow[];
  domains: DomainRow[];
  sightings: SightingRow[];
};

export type ImportResult = {
  sites: number;
  scans: number;
  skipped: number;
};

export async function exportArchive(): Promise<ArchivePayload> {
  const [sites, scans, graphs, domains, sightings] = await Promise.all([
    db.sites.toArray(),
    db.scans.toArray(),
    db.scanGraphs.toArray(),
    db.domains.toArray(),
    db.sightings.toArray(),
  ]);
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    list: LIST_ATTRIBUTION,
    sites,
    scans,
    graphs,
    domains,
    sightings,
  };
}

export function parseArchive(raw: unknown): ArchivePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("This file is not a LinkScope archive.");
  }
  const data = raw as Record<string, unknown>;
  if (data.formatVersion !== undefined && data.formatVersion !== 1) {
    throw new Error("This backup uses a newer format. Update LinkScope before importing it.");
  }
  if (!Array.isArray(data.sites) || !Array.isArray(data.scans) || !Array.isArray(data.graphs)) {
    throw new Error("This file is missing sites, scans, or graphs.");
  }
  return {
    formatVersion: 1,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    list: data.list && typeof data.list === "object" ? (data.list as { source?: string }) : undefined,
    sites: data.sites as SiteRow[],
    scans: data.scans as ScanRow[],
    graphs: data.graphs as ScanGraphRow[],
    domains: Array.isArray(data.domains) ? (data.domains as DomainRow[]) : [],
    sightings: Array.isArray(data.sightings) ? (data.sightings as SightingRow[]) : [],
  };
}

export async function importArchive(archive: ArchivePayload): Promise<ImportResult> {
  const existingSites = await db.sites.toArray();
  const siteByDomain = new Map(existingSites.filter((site) => site.domain).map((site) => [site.domain, site]));
  const existingScans = await db.scans.toArray();
  const scanKeys = new Set(existingScans.map((scan) => scanKey(scan)));

  const siteIdMap = new Map<number, number>();
  const scanIdMap = new Map<number, number>();
  let importedSites = 0;
  let importedScans = 0;
  let skipped = 0;

  await db.transaction("rw", db.sites, db.scans, db.scanGraphs, db.domains, db.sightings, async () => {
    for (const site of archive.sites) {
      if (!site.domain || site.id === undefined) continue;
      const existing = siteByDomain.get(site.domain);
      if (existing?.id !== undefined) {
        siteIdMap.set(site.id, existing.id);
        await db.sites.update(existing.id, {
          firstSeen: Math.min(existing.firstSeen, site.firstSeen),
          lastSeen: Math.max(existing.lastSeen, site.lastSeen),
          scanCount: existing.scanCount,
        });
        continue;
      }
      const newId = await db.sites.add({
        domain: site.domain,
        firstSeen: site.firstSeen,
        lastSeen: site.lastSeen,
        scanCount: 0,
      });
      siteIdMap.set(site.id, newId);
      siteByDomain.set(site.domain, { ...site, id: newId, scanCount: 0 });
      importedSites += 1;
    }

    const graphByScanId = new Map(archive.graphs.map((graph) => [graph.scanId, graph]));

    for (const scan of archive.scans) {
      if (scan.id === undefined) continue;
      const siteId = siteIdMap.get(scan.siteId);
      if (siteId === undefined) {
        skipped += 1;
        continue;
      }
      if (scanKeys.has(scanKey(scan))) {
        const existing = existingScans.find((row) => scanKey(row) === scanKey(scan));
        if (existing?.id !== undefined && scan.savedAt !== undefined && existing.savedAt === undefined) {
          await db.scans.update(existing.id, { savedAt: scan.savedAt });
        }
        skipped += 1;
        continue;
      }
      const graph = graphByScanId.get(scan.id);
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        skipped += 1;
        continue;
      }

      const scored =
        scan.privacyScore === undefined
          ? scoreSnapshot({
              scanId: 0,
              originDomain: graph.originDomain || scan.domain,
              nodes: graph.nodes as GraphNodeRecord[],
              edges: graph.edges as GraphEdgeRecord[],
            })
          : null;

      const newScanId = await db.scans.add({
        savedAt: scan.savedAt,
        siteId,
        url: scan.url,
        title: scan.title,
        domain: scan.domain,
        timestamp: scan.timestamp,
        nodeCount: scan.nodeCount,
        edgeCount: scan.edgeCount,
        thirdPartyCount: scan.thirdPartyCount,
        trackerCount: scan.trackerCount,
        captureMode: scan.captureMode,
        durationMs: scan.durationMs,
        privacyScore: scan.privacyScore ?? scored?.score,
        scoreVersion: scan.scoreVersion ?? scored?.modelVersion,
        unknownCount: scan.unknownCount ?? scored?.unknown,
        iframeCount: scan.iframeCount ?? scored?.iframeCount,
      });
      scanIdMap.set(scan.id, newScanId);
      scanKeys.add(scanKey(scan));
      await db.scanGraphs.put({
        scanId: newScanId,
        originDomain: graph.originDomain || scan.domain,
        nodes: graph.nodes as GraphNodeRecord[],
        edges: graph.edges as GraphEdgeRecord[],
      });
      importedScans += 1;

      const site = await db.sites.get(siteId);
      if (site) {
        await db.sites.update(siteId, {
          scanCount: site.scanCount + 1,
          lastSeen: Math.max(site.lastSeen, scan.timestamp),
          firstSeen: Math.min(site.firstSeen, scan.timestamp),
        });
      }
    }

    for (const domain of archive.domains) {
      if (!domain.domain) continue;
      const existing = await db.domains.get(domain.domain);
      if (!existing) {
        await db.domains.put({
          domain: domain.domain,
          category: domain.category,
          firstSeen: domain.firstSeen,
          lastSeen: domain.lastSeen,
          seenOnCount: 0,
          referenceCount: domain.referenceCount ?? 0,
        });
        continue;
      }
      await db.domains.put({
        ...existing,
        lastSeen: Math.max(existing.lastSeen, domain.lastSeen),
        firstSeen: Math.min(existing.firstSeen, domain.firstSeen),
        referenceCount: existing.referenceCount + (domain.referenceCount ?? 0),
        category: existing.category === "unknown" ? domain.category : existing.category,
      });
    }

    for (const sighting of archive.sightings) {
      const siteId = siteIdMap.get(sighting.siteId);
      const lastScanId = scanIdMap.get(sighting.lastScanId);
      if (siteId === undefined || lastScanId === undefined) continue;
      const existing = await db.sightings.where("[domain+siteId]").equals([sighting.domain, siteId]).first();
      if (existing?.id !== undefined) {
        const types = Array.from(new Set([...existing.types, ...asTypes(sighting.types)]));
        await db.sightings.update(existing.id, {
          types,
          lastScanId,
          lastSeen: Math.max(existing.lastSeen, sighting.lastSeen),
        });
        continue;
      }
      await db.sightings.add({
        domain: sighting.domain,
        siteId,
        siteDomain: sighting.siteDomain,
        types: asTypes(sighting.types),
        lastScanId,
        lastSeen: sighting.lastSeen,
      });
      const domainRow = await db.domains.get(sighting.domain);
      if (domainRow) {
        await db.domains.put({ ...domainRow, seenOnCount: domainRow.seenOnCount + 1 });
      }
    }
  });

  return { sites: importedSites, scans: importedScans, skipped };
}

function scanKey(scan: Pick<ScanRow, "domain" | "timestamp" | "url">): string {
  return `${scan.domain}|${String(scan.timestamp)}|${scan.url}`;
}

function asTypes(types: unknown): ConnectionType[] {
  if (!Array.isArray(types)) return [];
  return types.filter((item): item is ConnectionType => typeof item === "string");
}
