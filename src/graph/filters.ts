import { isFirstPartyDomain } from "@/src/analysis/firstParty";
import type {
  ConnectionType,
  DomainCategory,
  GraphEdgeRecord,
  GraphNodeRecord,
} from "@/src/types/graph";
import {
  CONNECTION_TYPES,
  INFRA_CATEGORIES,
  TRACKER_CATEGORIES,
} from "@/src/types/graph";

export function defaultEnabledTypes(): Record<ConnectionType, boolean> {
  const enabled = {} as Record<ConnectionType, boolean>;
  for (const type of CONNECTION_TYPES) {
    // Show the complete map on first open. Hiding links/other by default made
    // small scans look empty when their only connections used those types.
    enabled[type] = true;
  }
  return enabled;
}

export type CategoryLens =
  | "all"
  | "trackers"
  | "advertising"
  | "analytics"
  | "cdn"
  | "social"
  | "unknown"
  | "new";

export type GraphFilterState = {
  enabledTypes: Record<ConnectionType, boolean>;
  thirdPartyOnly: boolean;
  hideCommonInfra: boolean;
  hideFirstParty: boolean;
  searchQuery: string;
  categoryLens: CategoryLens;
  hiddenDomains: string[];
  newDomains: string[];
};

export function bestSearchMatch(
  nodes: GraphNodeRecord[],
  query: string,
): GraphNodeRecord | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const ranked = nodes
    .map((node) => {
      const domain = node.domain;
      if (domain === q || domain === `${q}.com`) return { node, score: 0 };
      if (domain.startsWith(`${q}.`) || domain.startsWith(q))
        return { node, score: 1 };
      if (domain.split(".")[0] === q) return { node, score: 2 };
      if (domain.includes(q)) return { node, score: 10 + domain.indexOf(q) };
      if (node.hostnames.some((host) => host.includes(q)))
        return { node, score: 30 };
      return null;
    })
    .filter(
      (item): item is { node: GraphNodeRecord; score: number } => item !== null,
    )
    .sort((a, b) => a.score - b.score);
  return ranked[0]?.node ?? null;
}

export function matchesSearch(node: GraphNodeRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (node.domain.includes(q)) return true;
  return node.hostnames.some((host) => host.includes(q));
}

export function isNodeVisible(
  node: GraphNodeRecord,
  edges: GraphEdgeRecord[],
  filters: GraphFilterState,
  originDomain: string,
): boolean {
  if (node.isOrigin || node.isSite) return true;
  const hiddenDomains = new Set(filters.hiddenDomains);
  const newDomains = new Set(filters.newDomains);
  if (
    !passesNodeFilters(node, filters, originDomain, hiddenDomains, newDomains)
  )
    return false;
  return edges.some(
    (edge) =>
      filters.enabledTypes[edge.type] &&
      (edge.source === node.domain || edge.target === node.domain),
  );
}

function passesNodeFilters(
  node: GraphNodeRecord,
  filters: GraphFilterState,
  originDomain: string,
  hiddenDomains: Set<string>,
  newDomains: Set<string>,
): boolean {
  if (hiddenDomains.has(node.domain)) return false;
  const firstParty =
    Boolean(node.isFirstParty) || isFirstPartyDomain(originDomain, node.domain);
  if (filters.hideFirstParty && firstParty) return false;
  if (
    filters.hideCommonInfra &&
    INFRA_CATEGORIES.has(node.category as DomainCategory) &&
    !firstParty
  ) {
    return false;
  }
  if (
    filters.thirdPartyOnly &&
    !TRACKER_CATEGORIES.has(node.category as DomainCategory)
  ) {
    return false;
  }
  if (filters.thirdPartyOnly && firstParty) return false;
  if (
    filters.categoryLens === "trackers" &&
    !TRACKER_CATEGORIES.has(node.category)
  )
    return false;
  if (filters.categoryLens === "advertising" && node.category !== "advertising")
    return false;
  if (
    filters.categoryLens === "analytics" &&
    node.category !== "analytics" &&
    node.category !== "telemetry"
  ) {
    return false;
  }
  if (filters.categoryLens === "cdn" && !INFRA_CATEGORIES.has(node.category))
    return false;
  if (filters.categoryLens === "social" && node.category !== "social")
    return false;
  if (filters.categoryLens === "unknown" && node.category !== "unknown")
    return false;
  if (filters.categoryLens === "new" && !newDomains.has(node.domain))
    return false;
  return true;
}

export function filterSnapshot(
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  filters: GraphFilterState,
  originDomain: string,
): { nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] } {
  const visibleEdges = edges.filter((edge) => filters.enabledTypes[edge.type]);
  const connectedDomains = new Set<string>();
  for (const edge of visibleEdges) {
    connectedDomains.add(edge.source);
    connectedDomains.add(edge.target);
  }
  const hiddenDomains = new Set(filters.hiddenDomains);
  const newDomains = new Set(filters.newDomains);
  const visibleNodes = nodes.filter(
    (node) =>
      node.isOrigin ||
      node.isSite ||
      (connectedDomains.has(node.domain) &&
        passesNodeFilters(
          node,
          filters,
          originDomain,
          hiddenDomains,
          newDomains,
        )),
  );
  const ids = new Set(visibleNodes.map((node) => node.domain));
  return {
    nodes: visibleNodes,
    edges: visibleEdges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}

export function neighborIds(
  domain: string,
  edges: GraphEdgeRecord[],
): string[] {
  const ids = new Set<string>([domain]);
  for (const edge of edges) {
    if (edge.source === domain) ids.add(edge.target);
    if (edge.target === domain) ids.add(edge.source);
  }
  return Array.from(ids);
}
