import { describeDomain, isTrackerCategory } from "@/src/analysis/categorizer";
import { isFirstPartyDomain } from "@/src/analysis/firstParty";
import type { GraphNodeRecord, ScanGraphSnapshot } from "@/src/types/graph";

export function withFirstParty(originDomain: string, node: GraphNodeRecord): GraphNodeRecord {
  if (node.isOrigin) {
    return {
      ...node,
      isFirstParty: true,
      listed: false,
      owner: undefined,
      classificationSource: "first-party",
      classificationConfidence: "high",
    };
  }
  const listed = describeDomain(node.domain);
  const firstParty = Boolean(node.isFirstParty) || isFirstPartyDomain(originDomain, node.domain);
  return {
    ...node,
    isFirstParty: firstParty,
    category: node.isOrigin ? "origin" : listed.category,
    owner: listed.owner,
    listed: listed.listed,
    classificationSource: firstParty ? "first-party" : listed.source,
    classificationConfidence: firstParty ? "high" : listed.confidence,
  };
}

export function enrichSnapshot(snapshot: ScanGraphSnapshot): ScanGraphSnapshot {
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => withFirstParty(snapshot.originDomain, node)),
  };
}

export function trackerCountOf(snapshot: ScanGraphSnapshot): number {
  const graph = enrichSnapshot(snapshot);
  return graph.nodes.filter(
    (node) => !node.isOrigin && !node.isFirstParty && isTrackerCategory(node.category),
  ).length;
}

export function thirdPartyCountOf(snapshot: ScanGraphSnapshot): number {
  const graph = enrichSnapshot(snapshot);
  return graph.nodes.filter((node) => !node.isOrigin && !node.isFirstParty).length;
}
