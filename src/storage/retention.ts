import { db } from "@/src/storage/database";

export const MAX_STORED_SCANS = 20;
export const SCAN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function deleteScanIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  await db.transaction("rw", db.scans, db.scanGraphs, db.alerts, db.sites, db.sightings, async () => {
    await db.scanGraphs.bulkDelete(ids);
    await db.scans.bulkDelete(ids);
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

/** Free keeps a rolling local history; Pro retains every snapshot. */
export async function pruneSnapshots(now = Date.now(), unlimited = false): Promise<void> {
  if (unlimited) return;
  const cutoff = now - SCAN_TTL_MS;
  const expired = await db.scans.where("timestamp").below(cutoff).toArray();
  await deleteScanIds(expired.map((row) => row.id).filter((id): id is number => id !== undefined));

  const remaining = await db.scans.orderBy("timestamp").toArray();
  if (remaining.length <= MAX_STORED_SCANS) return;
  const extra = remaining.slice(0, remaining.length - MAX_STORED_SCANS);
  await deleteScanIds(extra.map((row) => row.id).filter((id): id is number => id !== undefined));
}
