import {
  classifyChange,
  privacyResources,
} from "@/src/analysis/changeImportance";
import { scoreSnapshot } from "@/src/analysis/score";
import {
  CATEGORY_LABELS,
  type ScanGraphSnapshot,
  type ScanRow,
} from "@/src/types/graph";

export function buildSiteReport(
  scan: ScanRow,
  graph: ScanGraphSnapshot,
  previous?: { scan: ScanRow; graph: ScanGraphSnapshot },
) {
  if (graph.scanId !== scan.id || graph.originDomain !== scan.domain)
    throw new Error("The saved evidence does not match this scan.");
  if (
    previous &&
    (previous.scan.siteId !== scan.siteId ||
      previous.scan.domain !== scan.domain ||
      previous.scan.timestamp >= scan.timestamp ||
      previous.graph.scanId !== previous.scan.id ||
      previous.graph.originDomain !== scan.domain)
  ) {
    throw new Error("Compare an earlier capture of the same site.");
  }
  const current = privacyResources(graph).sort((a, b) =>
    a.domain.localeCompare(b.domain),
  );
  const before = previous ? privacyResources(previous.graph) : [];
  const beforeDomains = new Set(before.map((node) => node.domain));
  const currentDomains = new Set(current.map((node) => node.domain));
  const added = previous
    ? current.filter((node) => !beforeDomains.has(node.domain))
    : [];
  const removed = before.filter((node) => !currentDomains.has(node.domain));
  const change = classifyChange(previous?.scan, scan, previous?.graph, graph);
  const score = scoreSnapshot(graph);
  const nextSteps = previous
    ? added.length
      ? [
          "Compare the added services with your recent deployments, plugins, tag manager, and consent settings.",
          "Check the same page and consent state again to confirm the change before making a client recommendation.",
        ]
      : [
          "No new third-party resource domains were observed in this comparison. Keep watching for future changes.",
        ]
    : [
        "This capture is your starting point. Watch this site, then compare a later capture after a deployment or plugin update.",
      ];
  if (current.some((node) => node.category === "unknown"))
    nextSteps.push(
      "Review unclassified domains before deciding whether they are expected.",
    );
  return {
    scan,
    previous: previous?.scan,
    resources: current,
    added,
    removed,
    change,
    score,
    nextSteps,
  };
}

export type SiteReport = ReturnType<typeof buildSiteReport>;
export const REPORT_LIMITATION =
  "A page capture records observed connections, not proof of data collection, consent compliance, or site safety. Results can vary by page, login, consent, location, and capture timing. Scores are exposure heuristics; unknown services are not a clean bill of health.";

export function siteReportText(report: SiteReport): string {
  const { scan, previous, score, resources, added, removed, nextSteps } =
    report;
  return [
    "LINKSCOPE · WEBSITE CONNECTION REPORT",
    scan.domain,
    `Captured: ${new Date(scan.timestamp).toISOString()}`,
    previous
      ? `Compared with: ${new Date(previous.timestamp).toISOString()}`
      : "Initial capture · no earlier comparison",
    `Exposure score: ${score.score}/100`,
    ...score.reasons,
    "",
    "OBSERVED THIRD-PARTY RESOURCE DOMAINS",
    ...resources.map(
      (node) =>
        `${node.domain} · ${CATEGORY_LABELS[node.category]} · ${node.classificationSource ?? "unknown"}${node.owner ? ` · ${node.owner}` : ""}`,
    ),
    ...(resources.length ? [] : ["None observed in this capture."]),
    "",
    "CHANGES",
    ...(previous
      ? [
          `Added: ${added.map((node) => node.domain).join(", ") || "None"}`,
          `Removed: ${removed.map((node) => node.domain).join(", ") || "None"}`,
        ]
      : ["A second capture is needed to identify changes."]),
    "",
    "RECOMMENDED FOLLOW-UP",
    ...nextSteps.map((step) => `• ${step}`),
    "",
    "SCOPE AND LIMITATIONS",
    REPORT_LIMITATION,
    "Full page URLs, titles, and raw evidence are omitted from this report. Site and service domains are included. Review before sharing.",
    "",
    "Prepared with LinkScope · scan data stays in your browser.",
  ].join("\n");
}
