import { db } from "./database";
import { BACKUP_SETTING_KEYS, parseCompleteBackup, type CompleteBackup } from "./backupSchema";

const TABLE_NAMES = ["sites", "scans", "scanGraphs", "domains", "sightings", "alerts", "settings", "watchedSites", "audits", "auditPages", "auditPageGraphs", "auditDomains"] as const;

export async function createCompleteBackup(): Promise<CompleteBackup> {
  const rules = typeof browser !== "undefined" && browser.declarativeNetRequest?.getDynamicRules
    ? await browser.declarativeNetRequest.getDynamicRules() : [];
  const blockedDomains = Array.from(new Set(rules.filter((rule) => rule.action.type === "block").flatMap((rule) => rule.condition.requestDomains ?? [])));
  return db.transaction("r", TABLE_NAMES.map((name) => db.table(name)), async () => {
    const tables: Record<string, unknown[]> = {};
    for (const name of TABLE_NAMES) tables[name] = await db.table(name).toArray();
    tables.settings = (await db.settings.toArray()).filter((row) => BACKUP_SETTING_KEYS.some((key) => key === row.key));
    return parseCompleteBackup({ kind: "linkscope-complete-backup", formatVersion: 1, schemaVersion: 5, exportedAt: new Date().toISOString(), blockedDomains, tables });
  });
}

/** Caller must obtain explicit replacement confirmation. All DB writes roll back together. */
export async function restoreCompleteBackup(raw: unknown): Promise<void> {
  const backup = parseCompleteBackup(raw);
  await db.transaction("rw", TABLE_NAMES.map((name) => db.table(name)), async () => {
    // Leave internal settings (e.g. billing safety markers) untouched.
    for (const name of TABLE_NAMES) {
      if (name === "settings") continue;
      await db.table(name).clear();
      const rows = name === "watchedSites"
        ? backup.tables.watchedSites.map((row) => ({ ...row, enabled: false }))
        : name === "audits"
          ? backup.tables.audits.map((row) => ["running", "discovering"].includes(row.status) ? { ...row, status: "cancelled", error: "Restored from backup; start a new audit to scan again." } : row)
          : backup.tables[name];
      if (rows.length) await db.table(name).bulkAdd(rows);
    }
    await db.settings.bulkDelete([...BACKUP_SETTING_KEYS]);
    await db.settings.bulkPut(backup.tables.settings);
    await db.settings.put({ key: "automatic-protection", value: "false" });
    const pending = backup.tables.settings.find((row) => row.key === "pending-block-domains");
    const previous: unknown = pending ? JSON.parse(pending.value) : [];
    await db.settings.put({ key: "pending-block-domains", value: JSON.stringify(Array.from(new Set([...backup.blockedDomains, ...(Array.isArray(previous) ? previous.filter((value): value is string => typeof value === "string") : [])]))) });
    await db.settings.put({ key: "history-cleanup-paused", value: "true" });
  });
}

export async function pendingBlockDomains(): Promise<string[]> {
  const row = await db.settings.get("pending-block-domains");
  try { const value: unknown = JSON.parse(row?.value ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

export async function dismissPendingBlock(domain: string): Promise<void> {
  await db.settings.put({ key: "pending-block-domains", value: JSON.stringify((await pendingBlockDomains()).filter((item) => item !== domain)) });
}
