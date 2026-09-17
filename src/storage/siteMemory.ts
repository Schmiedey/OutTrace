import {
  isConfirmedTracker,
  privacyResources,
} from "@/src/analysis/changeImportance";
import { scoreSnapshot } from "@/src/analysis/score";
import { db } from "@/src/storage/database";
import type { ScanGraphSnapshot, ScanRow } from "@/src/types/graph";

export type SiteMemory = {
  domain: string;
  firstSeenAt: number;
  lastSeenAt: number;
  normalTrackerDomains: string[];
  normalOwners: string[];
  highestTrackerCount: number;
  lowestTrackerCount: number;
  typicalTrackerCount: number;
  typicalScore: number;
  scanCount: number;
  lastImportantChangeAt?: number;
};
type Sample = {
  timestamp: number;
  trackers: string[];
  owners: string[];
  score: number;
};
function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length
    ? Math.round(
        ordered.length % 2
          ? ordered[middle]!
          : (ordered[middle - 1]! + ordered[middle]!) / 2,
      )
    : 0;
}
function typicalSets(sets: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const set of sets)
    for (const value of new Set(set))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count >= Math.ceil(sets.length / 2))
    .map(([value]) => value)
    .sort();
}
export function memoryFromSamples(
  domain: string,
  samples: Sample[],
  lastImportantChangeAt?: number,
): SiteMemory | undefined {
  if (!samples.length) return undefined;
  const counts = samples.map((sample) => sample.trackers.length);
  return {
    domain,
    firstSeenAt: Math.min(...samples.map((sample) => sample.timestamp)),
    lastSeenAt: Math.max(...samples.map((sample) => sample.timestamp)),
    normalTrackerDomains: typicalSets(samples.map((sample) => sample.trackers)),
    normalOwners: typicalSets(samples.map((sample) => sample.owners)),
    highestTrackerCount: Math.max(...counts),
    lowestTrackerCount: Math.min(...counts),
    typicalTrackerCount: median(counts),
    typicalScore: median(samples.map((sample) => sample.score)),
    scanCount: samples.length,
    lastImportantChangeAt,
  };
}
/** Derived entirely from retained local history, so restore/delete cannot leave orphan baselines. */
export async function getSiteMemory(
  siteId: number,
  beforeTimestamp = Infinity,
): Promise<SiteMemory | undefined> {
  const scans = (await db.scans.where("siteId").equals(siteId).toArray())
    .filter((scan) => scan.timestamp < beforeTimestamp)
    .sort((a, b) => b.timestamp - a.timestamp || (b.id ?? 0) - (a.id ?? 0))
    .slice(0, 30);
  if (!scans.length) return undefined;
  const graphs = await db.scanGraphs.bulkGet(scans.map((scan) => scan.id!));
  const samples = scans.flatMap((scan, index) => {
    const graph = graphs[index];
    if (!graph) return [];
    const nodes = privacyResources(graph);
    return [
      {
        timestamp: scan.timestamp,
        trackers: nodes.filter(isConfirmedTracker).map((node) => node.domain),
        owners: [
          ...new Set(
            nodes
              .map((node) => node.owner)
              .filter((owner): owner is string => Boolean(owner)),
          ),
        ],
        score: scoreSnapshot(graph).score,
      },
    ];
  });
  const important = (await db.alerts.where("siteId").equals(siteId).toArray())
    .filter((alert) => alert.importance === "important")
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  return memoryFromSamples(scans[0]!.domain, samples, important?.timestamp);
}
export function unusualForSite(
  memory: SiteMemory | undefined,
  scan: ScanRow,
  graph?: ScanGraphSnapshot,
): string | undefined {
  if (!memory || memory.scanCount < 3 || !graph) return undefined;
  const trackers = privacyResources(graph).filter(isConfirmedTracker);
  const newTrackers = trackers.filter(
    (node) => !memory.normalTrackerDomains.includes(node.domain),
  );
  if (
    trackers.length - memory.typicalTrackerCount >= 2 &&
    trackers.length >= Math.max(1, memory.typicalTrackerCount) * 1.5 &&
    newTrackers.length
  )
    return `Unusual for ${scan.domain}: ${trackers.length} confirmed trackers; typically ${memory.typicalTrackerCount}. New to its baseline: ${newTrackers
      .map((node) => node.domain)
      .slice(0, 3)
      .join(", ")}.`;
  return undefined;
}
