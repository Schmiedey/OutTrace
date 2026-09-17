import { registrableDomain } from "@/src/lib/domain";
import { db } from "@/src/storage/database";
import { noteUsage } from "@/src/telemetry/usage";
import type { WatchedSiteRow, WatchedSiteSchedule } from "@/src/types/graph";

const DAY_MS = 24 * 60 * 60 * 1000;

function intervalMs(schedule: WatchedSiteSchedule): number {
  return schedule === "visit" ? Number.MAX_SAFE_INTEGER : schedule === "weekly" ? 7 * DAY_MS : DAY_MS;
}

export function normalizeWatchedSiteUrl(value: string): { url: string; domain: string } {
  const source = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const parsed = new URL(source);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Enter an http or https website URL.");
  }
  const domain = registrableDomain(parsed.href) ?? parsed.hostname;
  return { url: `${parsed.origin}/`, domain };
}

export async function listWatchedSites(): Promise<WatchedSiteRow[]> {
  return await db.watchedSites.orderBy("createdAt").reverse().toArray();
}

export async function isWatchedSite(domain: string): Promise<boolean> {
  return Boolean((await db.watchedSites.get(domain))?.enabled);
}

export async function listDueWatchedSites(now = Date.now()): Promise<WatchedSiteRow[]> {
  return await db.watchedSites
    .where("nextRunAt")
    .belowOrEqual(now)
    .filter((site) => site.enabled && site.schedule !== "visit")
    .toArray();
}

export async function addWatchedSite(
  value: string,
  schedule: WatchedSiteSchedule,
): Promise<WatchedSiteRow> {
  const target = normalizeWatchedSiteUrl(value);
  const existing = await db.watchedSites.get(target.domain);
  const now = Date.now();
  const row: WatchedSiteRow = {
    domain: target.domain,
    url: target.url,
    schedule,
    enabled: true,
    createdAt: existing?.createdAt ?? now,
    nextRunAt: schedule === "visit" ? Number.MAX_SAFE_INTEGER : existing?.nextRunAt ?? now,
    lastRunAt: existing?.lastRunAt,
    lastScanId: existing?.lastScanId,
    lastError: existing?.lastError,
    alertMode: existing?.alertMode ?? "important",
  };
  await db.watchedSites.put(row);
  if (!existing) noteUsage("watchlist-added");
  return row;
}

export async function updateWatchedSiteSchedule(
  domain: string,
  schedule: WatchedSiteSchedule,
): Promise<void> {
  await db.watchedSites.update(domain, {
    schedule,
    nextRunAt: schedule === "visit" ? Number.MAX_SAFE_INTEGER : Date.now() + intervalMs(schedule),
  });
}

export async function updateWatchedSiteAlertMode(domain: string, alertMode: "important" | "all" | "never"): Promise<void> {
  await db.watchedSites.update(domain, { alertMode });
}

export async function removeWatchedSite(domain: string): Promise<void> {
  await db.watchedSites.delete(domain);
}

export async function recordWatchedSiteResult(
  domain: string,
  schedule: WatchedSiteSchedule,
  input: { scanId?: number; error?: string },
): Promise<void> {
  const now = Date.now();
  const changes: Partial<WatchedSiteRow> = {
    lastRunAt: now,
    nextRunAt: schedule === "visit" ? Number.MAX_SAFE_INTEGER : now + intervalMs(schedule),
  };
  if (input.scanId !== undefined) {
    changes.lastScanId = input.scanId;
    changes.lastError = undefined;
  } else if (input.error) {
    changes.lastError = input.error;
  }
  await db.watchedSites.update(domain, changes);
}
