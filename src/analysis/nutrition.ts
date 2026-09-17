import { isTrackerCategory } from "@/src/analysis/categorizer";
import { enrichSnapshot } from "@/src/analysis/enrich";
import { gradeFromScore, scoreSnapshot, scoreFromScan, type PrivacyGrade } from "@/src/analysis/score";
import type { DomainCategory, GraphNodeRecord, ScanGraphSnapshot, ScanRow } from "@/src/types/graph";

export type NutritionCounts = {
  thirdParties: number;
  trackers: number;
  ads: number;
  analytics: number;
  cdns: number;
  social: number;
  unknown: number;
  media: number;
};

export type SiteNutrition = {
  privacy: PrivacyGrade;
  privacyScore: number;
  complexity: PrivacyGrade;
  counts: NutritionCounts;
  mix: Array<{ category: DomainCategory; count: number }>;
};

function complexityFromCount(thirdParties: number): PrivacyGrade {
  if (thirdParties <= 5) return "A";
  if (thirdParties <= 12) return "B";
  if (thirdParties <= 25) return "C";
  if (thirdParties <= 40) return "D";
  return "F";
}

function thirdPartiesOf(nodes: GraphNodeRecord[]): GraphNodeRecord[] {
  return nodes.filter((node) => !node.isOrigin && !node.isFirstParty);
}

export function countsFromNodes(nodes: GraphNodeRecord[]): NutritionCounts {
  const third = thirdPartiesOf(nodes);
  return {
    thirdParties: third.length,
    trackers: third.filter((node) => isTrackerCategory(node.category)).length,
    ads: third.filter((node) => node.category === "advertising").length,
    analytics: third.filter((node) => node.category === "analytics" || node.category === "telemetry").length,
    cdns: third.filter((node) => node.category === "cdn" || node.category === "infrastructure" || node.category === "hosting")
      .length,
    social: third.filter((node) => node.category === "social").length,
    unknown: third.filter((node) => node.category === "unknown").length,
    media: third.filter((node) => node.category === "media").length,
  };
}

export function countsSentence(counts: NutritionCounts): string {
  const parts = [
    `${String(counts.thirdParties)} third-party ${counts.thirdParties === 1 ? "domain" : "domains"}`,
    `${String(counts.trackers)} ${counts.trackers === 1 ? "tracker" : "trackers"}`,
    `${String(counts.ads)} ${counts.ads === 1 ? "ad" : "ads"}`,
  ];
  if (counts.unknown > 0) {
    parts.push(`${String(counts.unknown)} unknown`);
  }
  return parts.join(" · ");
}

export function mixFromCounts(counts: NutritionCounts): Array<{ category: DomainCategory; count: number }> {
  const rows: Array<{ category: DomainCategory; count: number }> = [
    { category: "cdn", count: counts.cdns },
    { category: "analytics", count: counts.analytics },
    { category: "advertising", count: counts.ads },
    { category: "media", count: counts.media },
    { category: "social", count: counts.social },
    { category: "unknown", count: counts.unknown },
  ];
  return rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
}

export function nutritionFromSnapshot(snapshot: ScanGraphSnapshot, privacyScore?: number): SiteNutrition {
  const graph = enrichSnapshot(snapshot);
  const counts = countsFromNodes(graph.nodes);
  const resolvedScore = scoreSnapshot(snapshot).score;
  return {
    privacy: gradeFromScore(resolvedScore),
    privacyScore: resolvedScore,
    complexity: complexityFromCount(counts.thirdParties),
    counts,
    mix: mixFromCounts(counts),
  };
}

export function nutritionFromScan(scan: ScanRow, snapshot?: ScanGraphSnapshot): SiteNutrition {
  if (snapshot) return nutritionFromSnapshot(snapshot, scan.privacyScore);
  const counts: NutritionCounts = {
    thirdParties: scan.thirdPartyCount,
    trackers: scan.trackerCount,
    ads: 0,
    analytics: scan.trackerCount,
    cdns: 0,
    social: 0,
    unknown: scan.unknownCount ?? 0,
    media: 0,
  };
  const score = scoreFromScan(scan).score;
  return {
    privacy: gradeFromScore(score),
    privacyScore: score,
    complexity: complexityFromCount(scan.thirdPartyCount),
    counts,
    mix: mixFromCounts(counts),
  };
}
