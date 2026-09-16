import { db } from "@/src/storage/database";
import type { AlertRow, ScanRow } from "@/src/types/graph";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyBriefing = {
  checkedSites: number;
  checks: number;
  changedSites: number;
  newTrackers: number;
  blockedNoise: number;
  status: "quiet" | "changed" | "attention";
  headline: string;
  detail: string;
};

export type WeeklyTrend = {
  currentScore?: number;
  previousScore?: number;
  scoreDelta?: number;
  sitesChecked: number;
  headline: string;
};

function uniqueSites(scans: ScanRow[]): number {
  return new Set(scans.map((scan) => scan.siteId)).size;
}

export function summarizeBriefing(scans: ScanRow[], alerts: AlertRow[]): DailyBriefing {
  const checkedSites = uniqueSites(scans);
  const changedSites = new Set(alerts.map((alert) => alert.siteDomain)).size;
  const newTrackers = alerts.reduce((sum, alert) => sum + alert.addedTrackers.length, 0);
  const blockedNoise = alerts.reduce(
    (sum, alert) => sum + Math.max(0, (alert.addedDomains?.length ?? 0) - alert.addedTrackers.length),
    0,
  );
  const status = newTrackers > 0 ? "attention" : changedSites > 0 ? "changed" : "quiet";

  if (checkedSites === 0) {
    return {
      checkedSites,
      checks: scans.length,
      changedSites,
      newTrackers,
      blockedNoise,
      status,
      headline: "No sites checked yet today",
      detail: "Turn on automatic protection or open LinkScope on a website to start your daily briefing.",
    };
  }

  if (status === "quiet") {
    return {
      checkedSites,
      checks: scans.length,
      changedSites,
      newTrackers,
      blockedNoise,
      status,
      headline: "Nothing important changed",
      detail: `${String(checkedSites)} ${checkedSites === 1 ? "site was" : "sites were"} checked today.`,
    };
  }

  return {
    checkedSites,
    checks: scans.length,
    changedSites,
    newTrackers,
    blockedNoise,
    status,
    headline: newTrackers > 0
      ? `${String(newTrackers)} new ${newTrackers === 1 ? "tracker needs" : "trackers need"} a look`
      : `${String(changedSites)} ${changedSites === 1 ? "site changed" : "sites changed"}`,
    detail: `${String(checkedSites)} ${checkedSites === 1 ? "site" : "sites"} checked today · ${String(changedSites)} changed.`,
  };
}

function averageScore(scans: ScanRow[]): number | undefined {
  const scored = scans.filter((scan) => scan.privacyScore !== undefined);
  if (scored.length === 0) return undefined;
  return Math.round(scored.reduce((sum, scan) => sum + (scan.privacyScore ?? 0), 0) / scored.length);
}

export function summarizeWeeklyTrend(current: ScanRow[], previous: ScanRow[]): WeeklyTrend {
  const currentScore = averageScore(current);
  const previousScore = averageScore(previous);
  const scoreDelta = currentScore !== undefined && previousScore !== undefined ? currentScore - previousScore : undefined;
  let headline = "Keep browsing to build your weekly trend";
  if (currentScore !== undefined && previousScore === undefined) headline = `Your average privacy score is ${String(currentScore)}`;
  if (scoreDelta !== undefined) {
    headline = scoreDelta === 0
      ? "Your privacy score held steady"
      : `Your privacy score is ${String(Math.abs(scoreDelta))} ${scoreDelta > 0 ? "points better" : "points lower"}`;
  }
  return { currentScore, previousScore, scoreDelta, sitesChecked: uniqueSites(current), headline };
}

export async function getDailyBriefing(now = Date.now()): Promise<DailyBriefing> {
  const since = now - DAY_MS;
  const [scans, alerts] = await Promise.all([
    db.scans.where("timestamp").aboveOrEqual(since).toArray(),
    db.alerts.where("timestamp").aboveOrEqual(since).toArray(),
  ]);
  return summarizeBriefing(scans, alerts);
}

export async function getWeeklyTrend(now = Date.now()): Promise<WeeklyTrend> {
  const currentStart = now - 7 * DAY_MS;
  const previousStart = now - 14 * DAY_MS;
  const scans = await db.scans.where("timestamp").aboveOrEqual(previousStart).toArray();
  return summarizeWeeklyTrend(
    scans.filter((scan) => scan.timestamp >= currentStart),
    scans.filter((scan) => scan.timestamp < currentStart),
  );
}
