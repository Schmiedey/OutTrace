import { z } from "zod";
import { CONNECTION_TYPES, DOMAIN_CATEGORIES } from "@/src/types/graph";

const id = z.number().int().positive();
const count = z.number().int().nonnegative();
const time = z.number().finite().nonnegative();
const text = z.string();
const domain = z.string().min(1).max(253).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i);
const url = z.string().refine((value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }, "Invalid website URL");
const category = z.enum(DOMAIN_CATEGORIES);
const types = z.array(z.enum(CONNECTION_TYPES));
const node = z.object({ id: text, domain, category, isOrigin: z.boolean(), isSite: z.boolean(), isFirstParty: z.boolean(), referenceCount: count, hostnames: z.array(text) }).passthrough();
const evidence = z.object({ type: z.enum(CONNECTION_TYPES), url: text, hostname: text, snippet: text, context: text.optional() });
const edge = z.object({ id: text, source: text, target: text, type: z.enum(CONNECTION_TYPES), count, evidence: z.array(evidence) });
const graph = z.object({ originDomain: domain, nodes: z.array(node), edges: z.array(edge) });
const scan = z.object({ id, siteId: id, url, title: text, domain, timestamp: time, nodeCount: count, edgeCount: count, thirdPartyCount: count, trackerCount: count, savedAt: time.optional(), captureMode: z.enum(["snapshot", "watch", "scheduled", "automatic"]).optional(), durationMs: time.optional(), privacyScore: z.number().min(0).max(100).optional(), scoreVersion: count.optional(), unknownCount: count.optional(), iframeCount: count.optional() });

// Explicit allowlist: future account credentials must never enter portable backups.
export const BACKUP_SETTING_KEYS = ["notifications", "notification-mode", "automatic-protection", "automatic-protection-prompt", "alert-sensitivity", "digest-frequency", "ignored-domains", "followedDomains", "pending-block-domains"] as const;

export const backupSchema = z.object({
  kind: z.literal("linkscope-complete-backup"), formatVersion: z.literal(1), schemaVersion: z.literal(5), exportedAt: z.iso.datetime(),
  blockedDomains: z.array(domain),
  tables: z.object({
    sites: z.array(z.object({ id, domain, firstSeen: time, lastSeen: time, scanCount: count })),
    scans: z.array(scan),
    scanGraphs: z.array(graph.extend({ scanId: id })),
    domains: z.array(z.object({ domain, category, firstSeen: time, lastSeen: time, seenOnCount: count, referenceCount: count })),
    sightings: z.array(z.object({ id, domain, siteId: id, siteDomain: domain, types, lastScanId: id, lastSeen: time })),
    alerts: z.array(z.object({ id, siteId: id, siteDomain: domain, fromScanId: id, toScanId: id, timestamp: time, kind: z.enum(["new-trackers", "tracker-surge", "followed-seen", "watched-site-change"]), addedTrackers: z.array(domain), removedTrackers: z.array(domain), addedDomains: z.array(domain).optional(), removedDomains: z.array(domain).optional(), trackerDelta: z.number().int(), read: z.boolean(), importance: z.enum(["routine", "notable", "important"]).optional(), reasons: z.array(z.object({ code: text, label: text, importance: z.enum(["routine", "notable", "important"]) })).optional(), fingerprint: text.optional(), notifiedAt: time.optional(), digestedAt: time.optional() })),
    settings: z.array(z.object({ key: z.enum(BACKUP_SETTING_KEYS), value: text }).superRefine((row, context) => {
      if (["ignored-domains", "followedDomains", "pending-block-domains"].includes(row.key)) {
        try {
          if (!z.array(domain).safeParse(JSON.parse(row.value)).success) context.addIssue({ code: "custom", message: "Invalid domain preference" });
        } catch { context.addIssue({ code: "custom", message: "Invalid preference JSON" }); }
      }
      if (["automatic-protection", "notifications"].includes(row.key) && !["true", "false"].includes(row.value)) context.addIssue({ code: "custom", message: "Invalid boolean preference" });
      if (row.key === "alert-sensitivity" && !["all", "important"].includes(row.value)) context.addIssue({ code: "custom", message: "Invalid alert preference" });
      if (row.key === "digest-frequency" && !["daily", "weekly"].includes(row.value)) context.addIssue({ code: "custom", message: "Invalid digest preference" });
      if (row.key === "notification-mode" && !["none", "important", "weekly", "important-weekly"].includes(row.value)) context.addIssue({ code: "custom", message: "Invalid delivery preference" });
      if (row.key === "automatic-protection-prompt" && !["never-seen", "dismissed", "enabled"].includes(row.value)) context.addIssue({ code: "custom", message: "Invalid protection prompt preference" });
    })),
    watchedSites: z.array(z.object({ domain, url, schedule: z.enum(["visit", "daily", "weekly"]), enabled: z.boolean(), createdAt: time, nextRunAt: time, lastRunAt: time.optional(), lastScanId: id.optional(), lastError: text.optional(), alertMode: z.enum(["important", "all", "never"]).optional() })),
    audits: z.array(z.object({ id, domain, rootUrl: url, startedAt: time, status: z.enum(["discovering", "running", "completed", "cancelled", "failed"]), mode: z.enum(["quick", "standard", "deep"]), maxPages: count, waitMs: time, pagesDiscovered: count, pagesScanned: count, pagesFailed: count, uniqueDomains: count, thirdPartyCount: count, trackerCount: count, unknownCount: count, ownerCount: count }).passthrough()),
    auditPages: z.array(z.object({ id, auditId: id, url, path: text, title: text, status: z.enum(["queued", "scanning", "completed", "failed", "skipped"]), thirdPartyCount: count, trackerCount: count, unknownCount: count }).passthrough()),
    auditPageGraphs: z.array(graph.extend({ pageId: id, auditId: id })),
    auditDomains: z.array(z.object({ auditId: id, domain, category, pageCount: count, referenceCount: count, pages: z.array(text), types, listed: z.boolean(), isFirstParty: z.boolean() }).passthrough()),
  }),
});

export type CompleteBackup = z.infer<typeof backupSchema>;

export function parseCompleteBackup(raw: unknown): CompleteBackup {
  const result = backupSchema.safeParse(raw);
  if (!result.success) throw new Error("This backup is incomplete, damaged, or from an unsupported version. No data was changed.");
  const backup = result.data;
  const sites = new Set(backup.tables.sites.map((row) => row.id));
  const scans = new Set(backup.tables.scans.map((row) => row.id));
  const audits = new Set(backup.tables.audits.map((row) => row.id));
  const pages = new Map(backup.tables.auditPages.map((row) => [row.id, row.auditId]));
  if (backup.tables.scans.some((row) => !sites.has(row.siteId)) || backup.tables.scanGraphs.some((row) => !scans.has(row.scanId)) || backup.tables.auditPages.some((row) => !audits.has(row.auditId)) || backup.tables.auditDomains.some((row) => !audits.has(row.auditId)) || backup.tables.auditPageGraphs.some((row) => pages.get(row.pageId) !== row.auditId)) {
    throw new Error("This backup contains broken record links. No data was changed.");
  }
  return backup;
}
