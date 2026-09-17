import { db } from "@/src/storage/database";
import type { AlertRow, ScanRow } from "@/src/types/graph";
import { activityImportance } from "@/src/analysis/changeImportance";
import { scoreSnapshot } from "@/src/analysis/score";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyBriefing = {
  checkedSites: number;
  checks: number;
  changedSites: number;
  newTrackers: number;
  routineChanges: number;
  status: "quiet" | "changed" | "attention";
  headline: string;
  detail: string;
};

export type WeeklyTrend = {
  currentScore?: number;
  previousScore?: number;
  scoreDelta?: number;
  sitesChecked: number;
  comparisonSites: number;
  comparisonCurrentScore?: number;
  changedSites: number;
  gainedTrackers: number;
  improvedSites: number;
  headline: string;
};

function uniqueSites(scans: ScanRow[]): number {
  return new Set(scans.map((scan) => scan.siteId)).size;
}

export function summarizeBriefing(scans: ScanRow[], alerts: AlertRow[]): DailyBriefing {
  const routineChanges = alerts.filter((alert) => activityImportance(alert) === "routine").length;
  alerts = alerts.filter((alert) => activityImportance(alert) !== "routine");
  const checkedSites = uniqueSites(scans);
  const changedSites = new Set(alerts.map((alert) => alert.siteDomain)).size;
  const newTrackers = new Set(alerts.flatMap((alert) => alert.addedTrackers.map((domain) => `${alert.siteDomain}:${domain}`))).size;
  const status = newTrackers > 0 ? "attention" : changedSites > 0 ? "changed" : "quiet";

  if (checkedSites === 0) {
    return {
      checkedSites,
      checks: checkedSites,
      changedSites,
      newTrackers,
      routineChanges,
      status,
      headline: "No sites checked yet today",
      detail: "Check a website or optionally enable Quiet Protection. There is no need to check this inbox every day.",
    };
  }

  if (status === "quiet") {
    return {
      checkedSites,
      checks: checkedSites,
      changedSites,
      newTrackers,
      routineChanges,
      status,
      headline: "All quiet today",
      detail: `${String(checkedSites)} ${checkedSites === 1 ? "site" : "sites"} checked. No meaningful tracker changes.`,
    };
  }

  return {
    checkedSites,
    checks: checkedSites,
    changedSites,
    newTrackers,
    routineChanges,
    status,
    headline: newTrackers > 0
      ? `${String(newTrackers)} new ${newTrackers === 1 ? "tracker needs" : "trackers need"} a look`
      : `${String(changedSites)} ${changedSites === 1 ? "site changed" : "sites changed"}`,
    detail: `${String(checkedSites)} ${checkedSites === 1 ? "site" : "sites"} checked today · ${String(changedSites)} changed.`,
  };
}

function averageScore(scans: ScanRow[]): number | undefined {
  const scored = latestPerSite(scans).filter((scan) => scan.privacyScore !== undefined);
  if (scored.length === 0) return undefined;
  return Math.round(scored.reduce((sum, scan) => sum + (scan.privacyScore ?? 0), 0) / scored.length);
}

export function latestPerSite(scans: ScanRow[]): ScanRow[] {
  const latest = new Map<number, ScanRow>();
  for (const scan of scans) {
    const existing = latest.get(scan.siteId);
    if (!existing || scan.timestamp > existing.timestamp || (scan.timestamp === existing.timestamp && (scan.id ?? 0) > (existing.id ?? 0))) latest.set(scan.siteId, scan);
  }
  return [...latest.values()];
}
export function summarizeWeeklyTrend(current: ScanRow[], previous: ScanRow[], alerts: AlertRow[] = []): WeeklyTrend {
  current = latestPerSite(current); previous = latestPerSite(previous);
  const currentScore = averageScore(current);
  const before = new Map(previous.map((scan) => [scan.siteId, scan]));
  const paired = current.filter((scan) => scan.privacyScore !== undefined && before.get(scan.siteId)?.privacyScore !== undefined && scan.scoreVersion !== undefined && scan.scoreVersion === before.get(scan.siteId)?.scoreVersion);
  const comparisonSites = paired.length;
  const previousScore = comparisonSites >= 3 ? averageScore(paired.map((scan) => before.get(scan.siteId)!)) : undefined;
  const pairedScore = comparisonSites >= 3 ? averageScore(paired) : undefined;
  const scoreDelta = pairedScore !== undefined && previousScore !== undefined ? pairedScore - previousScore : undefined;
  let headline = "Keep browsing to build your weekly trend";
  if (currentScore !== undefined && previousScore === undefined) headline = `Your average privacy score is ${String(currentScore)}`;
  if (scoreDelta !== undefined) {
    headline = scoreDelta === 0
      ? "Your privacy score held steady"
      : `Your privacy score is ${String(Math.abs(scoreDelta))} ${scoreDelta > 0 ? "points better" : "points lower"}`;
  }
  return { currentScore, previousScore, scoreDelta, comparisonSites, comparisonCurrentScore: pairedScore, sitesChecked: uniqueSites(current), headline, changedSites: new Set(alerts.filter((alert) => activityImportance(alert) !== "routine").map((alert) => alert.siteDomain)).size, gainedTrackers: new Set(alerts.filter((alert) => alert.addedTrackers.length && activityImportance(alert) !== "routine").map((alert) => alert.siteDomain)).size, improvedSites: current.filter((scan) => { const old = before.get(scan.siteId); return old && scan.trackerCount < old.trackerCount; }).length };
}

export function localDayStart(now: number): number { const date = new Date(now); date.setHours(0, 0, 0, 0); return date.getTime(); }

export async function getDailyBriefing(now = Date.now()): Promise<DailyBriefing> {
  const since = localDayStart(now);
  const [scans, alerts] = await Promise.all([
    db.scans.where("timestamp").aboveOrEqual(since).toArray(),
    db.alerts.where("timestamp").aboveOrEqual(since).toArray(),
  ]);
  return summarizeBriefing(scans.filter((scan) => scan.timestamp <= now), alerts.filter((alert) => alert.timestamp <= now));
}

export async function getWeeklyTrend(now = Date.now()): Promise<WeeklyTrend> {
  const currentStart = now - 7 * DAY_MS;
  const previousStart = now - 14 * DAY_MS;
  const [scans, alerts] = await Promise.all([db.scans.where("timestamp").aboveOrEqual(previousStart).toArray(), db.alerts.where("timestamp").aboveOrEqual(currentStart).toArray()]);
  const observations = [...latestPerSite(scans.filter((scan) => scan.timestamp >= currentStart && scan.timestamp <= now)), ...latestPerSite(scans.filter((scan) => scan.timestamp < currentStart))];
  const graphs = await db.scanGraphs.bulkGet(observations.map((scan) => scan.id!));
  const interpreted = observations.map((scan, index) => {
    const graph = graphs[index]; if (!graph) return scan;
    const score = scoreSnapshot(graph); return { ...scan, privacyScore: score.score, scoreVersion: score.modelVersion, trackerCount: score.trackers };
  });
  return summarizeWeeklyTrend(
    interpreted.filter((scan) => scan.timestamp >= currentStart),
    interpreted.filter((scan) => scan.timestamp < currentStart),
    alerts.filter((alert) => alert.timestamp <= now),
  );
}
