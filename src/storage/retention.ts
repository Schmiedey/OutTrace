import { db } from "@/src/storage/database";

// Same finite device-storage safety boundary on every plan, never a usage quota.
export const FREE_MAX_STORED_SCANS = 1000;
export const FREE_SCAN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const PRO_MAX_STORED_SCANS = 1000;
export const PRO_SCAN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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

/** Every plan has a visible, finite local-storage boundary. */
export async function pruneSnapshots(now = Date.now(), extended = false): Promise<void> {
  if ((await db.settings.get("history-cleanup-paused"))?.value === "true") return;
  const ttl = extended ? PRO_SCAN_TTL_MS : FREE_SCAN_TTL_MS;
  const maxScans = extended ? PRO_MAX_STORED_SCANS : FREE_MAX_STORED_SCANS;
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
