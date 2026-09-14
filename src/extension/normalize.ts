import { describeDomain, isTrackerCategory } from "@/src/analysis/categorizer";
import { isFirstPartyDomain } from "@/src/analysis/firstParty";
import { hostnameFromUrl, registrableDomain } from "@/src/lib/domain";
import type {
  ConnectionType,
  Evidence,
  GraphEdgeRecord,
  GraphNodeRecord,
  RawFinding,
  RawScanPayload,
  ScanGraphSnapshot,
} from "@/src/types/graph";

const MAX_EVIDENCE = 12;

export type NormalizedScan = {
  originDomain: string;
  snapshot: Omit<ScanGraphSnapshot, "scanId">;
  thirdPartyCount: number;
  trackerCount: number;
};

function sourceUrlOf(finding: RawFinding, pageUrl: string): string {
  // A frame's document URL is the strongest evidence of the immediate parent
  // in the load chain. webRequest's initiator often collapses back to the
  // top-level security origin and would turn the graph into a flat star.
  const candidate = finding.documentUrl || finding.initiatorUrl;
  if (!candidate) return pageUrl;
  try {
    const protocol = new URL(candidate).protocol;
    return protocol === "http:" || protocol === "https:" ? candidate : pageUrl;
  } catch {
    return pageUrl;
  }
}

function addEdge(
  edges: Map<string, GraphEdgeRecord>,
  source: string,
  target: string,
  type: ConnectionType,
  evidence: Evidence,
): void {
  const edgeId = `${source}|${target}|${type}`;
  const existing = edges.get(edgeId);
  if (existing) {
    existing.count += 1;
    if (existing.evidence.length < MAX_EVIDENCE) existing.evidence.push(evidence);
    return;
  }
  edges.set(edgeId, {
    id: edgeId,
    source,
    target,
    type,
    count: 1,
    evidence: [evidence],
  });
}

export function normalizeScan(raw: RawScanPayload): NormalizedScan {
  const originDomain = registrableDomain(raw.url);
  if (!originDomain) {
    throw new Error("Could not parse this page’s domain.");
  }

  const edges = new Map<string, GraphEdgeRecord>();
  const hostnamesByDomain = new Map<string, Set<string>>();
  const referenceByDomain = new Map<string, number>();

  const touchHostname = (domain: string, hostname: string): void => {
    const set = hostnamesByDomain.get(domain) ?? new Set<string>();
    set.add(hostname);
    hostnamesByDomain.set(domain, set);
  };

  const touchDomain = (domain: string): void => {
    referenceByDomain.set(domain, (referenceByDomain.get(domain) ?? 0) + 1);
  };

  touchHostname(originDomain, hostnameFromUrl(raw.url) ?? originDomain);
  referenceByDomain.set(originDomain, 0);

  for (const finding of raw.findings) {
    const targetDomain = registrableDomain(finding.url);
    const hostname = hostnameFromUrl(finding.url);
    if (!targetDomain || !hostname) continue;

    const sourceDomain: string = registrableDomain(sourceUrlOf(finding, raw.url)) ?? originDomain;
    if (targetDomain === originDomain && sourceDomain === originDomain) continue;

    const type = finding.type as ConnectionType;
    const evidence: Evidence = {
      type,
      url: finding.url,
      hostname,
      snippet: finding.snippet,
    };
    if (finding.context) evidence.context = finding.context;

    touchHostname(targetDomain, hostname);
    touchDomain(targetDomain);
    if (sourceDomain !== targetDomain) {
      const sourceHost = hostnameFromUrl(sourceUrlOf(finding, raw.url));
      if (sourceHost) touchHostname(sourceDomain, sourceHost);
      touchDomain(sourceDomain);
      addEdge(edges, sourceDomain, targetDomain, type, evidence);
    }
  }

  const nodes: GraphNodeRecord[] = [];
  const domains = new Set<string>([originDomain, ...referenceByDomain.keys()]);

  for (const domain of domains) {
    const isOrigin = domain === originDomain;
    const isFirstParty = isOrigin || isFirstPartyDomain(originDomain, domain);
    const listed = isOrigin
      ? {
          category: "origin" as const,
          listed: false,
          owner: undefined,
          source: "first-party" as const,
          confidence: "high" as const,
        }
      : describeDomain(domain);
    nodes.push({
      id: domain,
      domain,
      category: isOrigin ? "origin" : listed.category,
      isOrigin,
      isSite: isOrigin,
      isFirstParty,
      referenceCount: referenceByDomain.get(domain) ?? 0,
      hostnames: Array.from(hostnamesByDomain.get(domain) ?? [domain]).sort(),
      owner: listed.owner,
      listed: listed.listed,
      classificationSource: isFirstParty ? "first-party" : listed.source,
      classificationConfidence: isFirstParty ? "high" : listed.confidence,
    });
  }

  nodes.sort((a, b) => {
    if (a.isOrigin) return -1;
    if (b.isOrigin) return 1;
    return a.domain.localeCompare(b.domain);
  });

  const edgeList = Array.from(edges.values()).sort((a, b) => a.id.localeCompare(b.id));
  const thirdPartyCount = nodes.filter((node) => !node.isOrigin && !node.isFirstParty).length;
  const trackerCount = nodes.filter(
    (node) => !node.isOrigin && !node.isFirstParty && isTrackerCategory(node.category),
  ).length;

  return {
    originDomain,
    thirdPartyCount,
    trackerCount,
    snapshot: {
      originDomain,
      nodes,
      edges: edgeList,
    },
  };
}
