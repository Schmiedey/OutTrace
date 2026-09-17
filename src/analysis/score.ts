import { isTrackerCategory } from "@/src/analysis/categorizer";
import { enrichSnapshot } from "@/src/analysis/enrich";
import type { ScanGraphSnapshot, ScanRow } from "@/src/types/graph";

export type PrivacyGrade = "A" | "B" | "C" | "D" | "F";

export type PrivacyScore = {
  modelVersion: 2;
  confidence: "limited" | "classified";
  domainPenalty: number;
  executionPenalty: number;
  score: number;
  grade: PrivacyGrade;
  trackers: number;
  unknown: number;
  thirdParties: number;
  iframeCount: number;
  thirdPartyScripts: number;
  totalScripts: number;
  reasons: string[];
};

export function gradeFromScore(score: number): PrivacyGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function scoreTone(grade: PrivacyGrade): "lime" | "ink" | "amber" | "rose" {
  if (grade === "A") return "lime";
  if (grade === "B") return "ink";
  if (grade === "C" || grade === "D") return "amber";
  return "rose";
}

export function scoreSnapshot(snapshot: ScanGraphSnapshot): PrivacyScore {
  const graph = enrichSnapshot(snapshot);
  // Hyperlinks describe destinations, not resources loaded by this page.
  const resourceDomains = new Set(graph.edges.filter((edge) => edge.type !== "link").map((edge) => edge.target));
  const third = Array.from(new Map(graph.nodes.filter((node) => !node.isOrigin && !node.isFirstParty && resourceDomains.has(node.domain)).map((node) => [node.domain, node])).values());
  const thirdSet = new Set(third.map((node) => node.domain));
  const trackerNodes = third.filter((node) => isTrackerCategory(node.category));
  const trackers = trackerNodes.length;
  const trackerSet = new Set(trackerNodes.map((node) => node.domain));
  const unknown = third.filter((node) => node.category === "unknown").length;
  const iframeCount = new Set(
    graph.edges.filter((edge) => edge.type === "iframe" && thirdSet.has(edge.target)).map((edge) => edge.target),
  ).size;
  const scriptEdges = graph.edges.filter((edge) => edge.type === "script");
  const thirdPartyScripts = scriptEdges.filter((edge) => thirdSet.has(edge.target)).length;
  const totalScripts = scriptEdges.length;

  const domainPenalty = Math.min(80, trackerNodes.reduce((sum, node) => sum + (node.classificationSource === "heuristic" ? 4 : 8), 0));
  const executingTrackers = new Set(graph.edges.filter((edge) => ["script", "iframe"].includes(edge.type) && trackerSet.has(edge.target)).map((edge) => edge.target));
  const executionPenalty = Math.min(20, executingTrackers.size * 2);
  const penalty = domainPenalty + executionPenalty;

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const reasons: string[] = [];
  if (trackers > 0) reasons.push(`${trackers} classified tracking ${trackers === 1 ? "domain" : "domains"}: −${domainPenalty} points`);
  if (executingTrackers.size > 0) reasons.push(`Tracking scripts/frames: −${executionPenalty} points`);
  if (unknown > 0) reasons.push(`${unknown} unclassified resource ${unknown === 1 ? "domain is" : "domains are"} not scored; unknown does not mean safe`);
  if (trackers === 0) reasons.push("No classified tracking resources found in this capture; this is not a safety guarantee.");

  return {
    modelVersion: 2,
    confidence: unknown > 0 || trackerNodes.some((node) => node.classificationSource === "heuristic") ? "limited" : "classified",
    domainPenalty,
    executionPenalty,
    score,
    grade: gradeFromScore(score),
    trackers,
    unknown,
    thirdParties: third.length,
    iframeCount,
    thirdPartyScripts,
    totalScripts,
    reasons,
  };
}

export function scoreFromScan(scan: ScanRow): { score: number; grade: PrivacyGrade } {
  if (scan.privacyScore !== undefined && scan.scoreVersion === 2) {
    return { score: scan.privacyScore, grade: gradeFromScore(scan.privacyScore) };
  }
  const penalty = Math.min(80, scan.trackerCount * 8);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score, grade: gradeFromScore(score) };
}

export function scoreVerdict(result: Pick<PrivacyScore, "score" | "trackers" | "unknown">): string {
  if (result.trackers === 0) return result.unknown > 0 ? "No classified tracking · limited visibility" : "No classified tracking found";
  if (result.score >= 70) return "Limited tracking exposure";
  if (result.score >= 40) return "Noticeable tracking exposure";
  return "Heavy tracking exposure";
}

export function scoreSummary(result: Pick<PrivacyScore, "trackers" | "unknown">): string {
  const tracking = result.trackers === 0 ? "No classified tracking resources found in this capture." : `This capture references ${result.trackers} classified tracking ${result.trackers === 1 ? "domain" : "domains"}.`;
  return result.unknown > 0 ? `${tracking} ${result.unknown} resource ${result.unknown === 1 ? "domain remains" : "domains remain"} unclassified.` : tracking;
}
