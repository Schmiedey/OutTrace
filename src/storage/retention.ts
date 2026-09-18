import { db } from "@/src/storage/database";

/** A device-safety boundary, never a plan quota. Both plans retain the same amount. */
export const FREE_MAX_STORED_SCANS = 1_000;
export const FREE_SCAN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const PRO_MAX_STORED_SCANS = FREE_MAX_STORED_SCANS;
export const PRO_SCAN_TTL_MS = FREE_SCAN_TTL_MS;
export const FREE_SCAN_LIMIT_ERROR = "";

export type FreeScanUsage = {
  used: number;
  limit: number;
  remaining: number;
};

export async function countRecentScans(now = Date.now()): Promise<number> {
  return await db.scans
    .where("timestamp")
    .aboveOrEqual(now - FREE_SCAN_TTL_MS)
    .count();
}

export async function getFreeScanUsage(now = Date.now()): Promise<FreeScanUsage> {
  const used = await countRecentScans(now);
  return {
    used,
    limit: FREE_MAX_STORED_SCANS,
    remaining: Math.max(0, FREE_MAX_STORED_SCANS - used),
  };
}

export async function assertFreeScanAvailable(now = Date.now()): Promise<void> {
  void now;
  // Manual scans are unlimited. Retention is pruned after saving as a shared
  // finite device-storage safety boundary rather than an access gate.
}

async function deleteScanIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction("rw", [db.scans, db.scanGraphs, db.alerts, db.sites, db.sightings, db.settings], async () => {
    if ((await db.settings.get("history-cleanup-paused"))?.value === "true") return;
    const removable = (await db.scans.bulkGet(ids)).filter((scan) => scan && scan.savedAt === undefined).map((scan) => scan!.id!);
    const idSet = new Set(removable);
    await db.scanGraphs.bulkDelete(removable);
    await db.scans.bulkDelete(removable);
    const alerts = await db.alerts.toArray();
    const stale = alerts.filter(
      (row) => idSet.has(row.fromScanId) || idSet.has(row.toScanId),
    );
    const alertIds = stale
      .map((row) => row.id)
      .filter((id): id is number => id !== undefined);
    if (alertIds.length > 0) await db.alerts.bulkDelete(alertIds);

    const sites = await db.sites.toArray();
    for (const site of sites) {
      if (site.id === undefined) continue;
      const remaining = await db.scans.where("siteId").equals(site.id).count();
      if (remaining === 0) {
        await db.sightings.where("siteId").equals(site.id).delete();
        await db.sites.delete(site.id);
      } else {
        await db.sites.update(site.id, { scanCount: remaining });
      }
    }
  });
}

/** Every plan uses the same bounded local-history policy. */
export async function pruneSnapshots(now = Date.now(), _unlimited = false): Promise<void> {
  if ((await db.settings.get("history-cleanup-paused"))?.value === "true") return;
  const ttl = FREE_SCAN_TTL_MS;
  const maxScans = FREE_MAX_STORED_SCANS;
  const cutoff = now - ttl;
  const expired = (await db.scans.where("timestamp").below(cutoff).toArray()).filter((scan) => scan.savedAt === undefined);
  await deleteScanIds(expired.map((row) => row.id).filter((id): id is number => id !== undefined));

  const remaining = (await db.scans.orderBy("timestamp").toArray()).filter((scan) => scan.savedAt === undefined);
  if (remaining.length <= maxScans) return;
  const extra = remaining.slice(0, remaining.length - maxScans);
  await deleteScanIds(extra.map((row) => row.id).filter((id): id is number => id !== undefined));
}

export async function historyCleanupPaused(): Promise<boolean> {
  return (await db.settings.get("history-cleanup-paused"))?.value === "true";
}

export async function resumeHistoryCleanup(): Promise<void> {
  await db.settings.put({ key: "history-cleanup-paused", value: "false" });
  await db.settings.put({ key: "history-downgrade-reviewed", value: "true" });
}
