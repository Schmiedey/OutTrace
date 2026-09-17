import { enrichSnapshot } from "@/src/analysis/enrich";
import { isTrackerCategory } from "@/src/analysis/categorizer";
import { scoreSnapshot } from "@/src/analysis/score";
import type {
  AlertRow,
  GraphNodeRecord,
  ScanGraphSnapshot,
  ScanRow,
} from "@/src/types/graph";

export type ChangeImportance = "routine" | "notable" | "important";
export type ChangeReason = {
  code: string;
  label: string;
  importance: ChangeImportance;
};
export type ChangeClassification = {
  importance: ChangeImportance;
  reasons: ChangeReason[];
  fingerprint: string;
};
export function activityImportance(alert: AlertRow): ChangeImportance {
  return (
    alert.importance ?? (alert.addedTrackers.length ? "important" : "routine")
  );
}

/** Loaded resources only: a hyperlink is not evidence that a tracker ran. */
export function privacyResources(
  snapshot: ScanGraphSnapshot,
): GraphNodeRecord[] {
  const graph = enrichSnapshot(snapshot);
  const loaded = new Set(
    graph.edges
      .filter((edge) => edge.type !== "link")
      .map((edge) => edge.target),
  );
  return graph.nodes.filter(
    (node) => !node.isOrigin && !node.isFirstParty && loaded.has(node.domain),
  );
}

export function isConfirmedTracker(node: GraphNodeRecord): boolean {
  return (
    isTrackerCategory(node.category) &&
    (node.classificationSource === "curated-list" || node.listed === true)
  );
}

export function isTrackerSurge(previous: number, current: number): boolean {
  return previous === 0
    ? current > 0
    : current - previous >= 2 && current >= previous * 1.25;
}

export function classifyChange(
  previousScan: ScanRow | undefined,
  currentScan: ScanRow,
  previousGraph: ScanGraphSnapshot | undefined,
  currentGraph: ScanGraphSnapshot,
  options: {
    newlyFollowedDomains?: string[];
    ignoredDomains?: string[];
    baseline?: {
      scanCount: number;
      typicalTrackerCount: number;
      normalTrackerDomains: string[];
    };
  } = {},
): ChangeClassification {
  const ignored = new Set(options.ignoredDomains ?? []);
  const current = privacyResources(currentGraph).filter(
    (node) => !ignored.has(node.domain),
  );
  const before = previousGraph
    ? privacyResources(previousGraph).filter(
        (node) => !ignored.has(node.domain),
      )
    : [];
  const beforeDomains = new Set(before.map((node) => node.domain));
  const beforeTrackers = new Set(
    before.filter(isConfirmedTracker).map((node) => node.domain),
  );
  const trackers = current.filter(isConfirmedTracker);
  const reasons: ChangeReason[] = [];
  const add = (code: string, label: string, importance: ChangeImportance) =>
    reasons.push({ code, label, importance });
  for (const domain of options.newlyFollowedDomains ?? []) {
    if (!ignored.has(domain) && current.some((node) => node.domain === domain))
      add(
        `followed:${domain}`,
        `${domain} appeared on this site for the first time`,
        "important",
      );
  }
  // A first capture establishes a baseline; it is not itself a change.
  if (previousScan && previousGraph) {
    const added = current.filter((node) => !beforeDomains.has(node.domain));
    const addedTrackers = trackers.filter(
      (node) => !beforeTrackers.has(node.domain),
    );
    const baseline = options.baseline;
    if (
      baseline &&
      baseline.scanCount >= 3 &&
      addedTrackers.length &&
      trackers.length - baseline.typicalTrackerCount >= 2 &&
      trackers.length >= Math.max(1, baseline.typicalTrackerCount) * 1.5 &&
      trackers.some(
        (node) => !baseline.normalTrackerDomains.includes(node.domain),
      )
    )
      add(
        "unusual-baseline",
        `Unusual for ${currentScan.domain}: ${trackers.length} confirmed trackers, typically ${baseline.typicalTrackerCount}`,
        "important",
      );
    if (beforeTrackers.size === 0 && addedTrackers.length)
      add(
        "first-tracker",
        "First confirmed tracking resource on a previously tracker-free site",
        "important",
      );
    for (const node of addedTrackers)
      add(
        `tracker:${node.domain}`,
        `New confirmed tracker: ${node.domain}`,
        "important",
      );
    if (
      isTrackerSurge(beforeTrackers.size, trackers.length) &&
      beforeTrackers.size > 0
    )
      add(
        "tracker-surge",
        `Confirmed trackers increased from ${beforeTrackers.size} to ${trackers.length}`,
        "important",
      );
    const owners = new Set(before.map((node) => node.owner).filter(Boolean));
    const addedOwners = new Set<string>();
    for (const node of added) {
      if (
        node.owner &&
        !owners.has(node.owner) &&
        !addedOwners.has(node.owner) &&
        !["cdn", "hosting", "infrastructure", "unknown"].includes(node.category)
      ) {
        addedOwners.add(node.owner);
        add(
          `owner:${node.owner}`,
          `New ${isTrackerCategory(node.category) ? "advertising/analytics " : ""}owner: ${node.owner}`,
          "notable",
        );
      }
    }
    const unknown = added.filter((node) => node.category === "unknown");
    if (unknown.length >= 3)
      add(
        "unknown-resources",
        `${unknown.length} new unclassified resource domains (not confirmed trackers)`,
        "notable",
      );
    // Recompute both captures with the same model; version changes must not alert.
    const drop =
      scoreSnapshot(previousGraph).score - scoreSnapshot(currentGraph).score;
    const execution = (graph: ScanGraphSnapshot) =>
      new Set(
        graph.edges
          .filter(
            (edge) =>
              ["script", "iframe"].includes(edge.type) &&
              current.some(
                (node) =>
                  node.domain === edge.target &&
                  isTrackerCategory(node.category),
              ),
          )
          .map((edge) => edge.target),
      );
    const previousExecution = execution(previousGraph);
    const newExecution = [...execution(currentGraph)].filter(
      (domain) => !previousExecution.has(domain),
    );
    const inferredTrackers = added.filter(
      (node) => isTrackerCategory(node.category) && !isConfirmedTracker(node),
    );
    if (
      drop >= 5 &&
      (addedTrackers.length || inferredTrackers.length || newExecution.length)
    ) {
      add(
        "score-decline",
        `Score fell ${drop} points: ${[...addedTrackers, ...inferredTrackers]
          .map((node) => node.domain)
          .concat(newExecution)
          .filter((domain, index, all) => all.indexOf(domain) === index)
          .join(", ")}`,
        drop >= 15 ? "important" : "notable",
      );
    }
  }
  const importance = reasons.some((reason) => reason.importance === "important")
    ? "important"
    : reasons.length
      ? "notable"
      : "routine";
  if (!reasons.length)
    add("routine", "No meaningful privacy change", "routine");
  // Stable, local state signature. Resource URLs and hostname churn are excluded.
  const fingerprint = JSON.stringify({
    trackers: trackers.map((node) => node.domain).sort(),
    owners: [
      ...new Set(
        current
          .filter(
            (node) =>
              !["cdn", "hosting", "infrastructure"].includes(node.category),
          )
          .map((node) => node.owner)
          .filter(Boolean),
      ),
    ].sort(),
    reasons: reasons
      .filter((reason) => reason.importance !== "routine")
      .map((reason) => reason.code)
      .sort(),
  });
  return { importance, reasons, fingerprint };
}
