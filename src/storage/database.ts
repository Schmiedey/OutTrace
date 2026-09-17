import Dexie, { type Table } from "dexie";
import type {
  AuditDomainRow,
  AuditPageGraphRow,
  AuditPageRow,
  AuditRow,
} from "@/src/audit/types";
import type {
  AlertRow,
  DomainRow,
  ScanGraphRow,
  ScanRow,
  SettingRow,
  SightingRow,
  SiteRow,
  WatchedSiteRow,
} from "@/src/types/graph";

export class LinkScopeDB extends Dexie {
  sites!: Table<SiteRow, number>;
  scans!: Table<ScanRow, number>;
  scanGraphs!: Table<ScanGraphRow, number>;
  domains!: Table<DomainRow, string>;
  sightings!: Table<SightingRow, number>;
  alerts!: Table<AlertRow, number>;
  settings!: Table<SettingRow, string>;
  audits!: Table<AuditRow, number>;
  auditPages!: Table<AuditPageRow, number>;
  auditPageGraphs!: Table<AuditPageGraphRow, number>;
  auditDomains!: Table<AuditDomainRow, [number, string]>;
  watchedSites!: Table<WatchedSiteRow, string>;

  constructor(name = "linkscope") {
    super(name);
    this.version(1).stores({
      sites: "++id, &domain, lastSeen",
      scans: "++id, siteId, domain, timestamp",
      scanGraphs: "scanId",
      domains: "&domain, category, lastSeen, seenOnCount",
      sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
    });
    this.version(2).stores({
      sites: "++id, &domain, lastSeen",
      scans: "++id, siteId, domain, timestamp",
      scanGraphs: "scanId",
      domains: "&domain, category, lastSeen, seenOnCount",
      sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
      alerts: "++id, siteId, timestamp, read",
      settings: "&key",
    });
    this.version(3).stores({
      sites: "++id, &domain, lastSeen",
      scans: "++id, siteId, domain, timestamp",
      scanGraphs: "scanId",
      domains: "&domain, category, lastSeen, seenOnCount",
      sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
      alerts: "++id, siteId, timestamp, read",
      settings: "&key",
      audits: "++id, domain, startedAt, status",
      auditPages: "++id, auditId, &[auditId+url], status",
      auditPageGraphs: "pageId, auditId",
      auditDomains: "[auditId+domain], auditId, domain, category, pageCount",
    });
    this.version(4).stores({
      sites: "++id, &domain, lastSeen",
      scans: "++id, siteId, domain, timestamp",
      scanGraphs: "scanId",
      domains: "&domain, category, lastSeen, seenOnCount",
      sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
      alerts: "++id, siteId, timestamp, read",
      settings: "&key",
      audits: "++id, domain, startedAt, status",
      auditPages: "++id, auditId, &[auditId+url], status",
      auditPageGraphs: "pageId, auditId",
      auditDomains: "[auditId+domain], auditId, domain, category, pageCount",
      watchedSites: "&domain, nextRunAt, enabled",
    });
    this.version(5).stores({
      sites: "++id, &domain, lastSeen",
      scans: "++id, siteId, domain, timestamp",
      scanGraphs: "scanId",
      domains: "&domain, category, lastSeen, seenOnCount",
      sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
      alerts: "++id, siteId, timestamp, read",
      settings: "&key",
      audits: "++id, domain, startedAt, status",
      auditPages: "++id, auditId, &[auditId+url], status",
      auditPageGraphs: "pageId, auditId",
      auditDomains: "[auditId+domain], auditId, domain, category, pageCount",
      watchedSites: "&domain, createdAt, nextRunAt, enabled",
    });
    this.version(6).stores({
      sites: "++id, &domain, lastSeen", scans: "++id, siteId, domain, timestamp", scanGraphs: "scanId",
      domains: "&domain, category, lastSeen, seenOnCount", sightings: "++id, &[domain+siteId], domain, siteId, lastSeen",
      alerts: "++id, siteId, timestamp, read", settings: "&key", audits: "++id, domain, startedAt, status",
      auditPages: "++id, auditId, &[auditId+url], status", auditPageGraphs: "pageId, auditId",
      auditDomains: "[auditId+domain], auditId, domain, category, pageCount", watchedSites: "&domain, createdAt, nextRunAt, enabled",
    }).upgrade(async (transaction) => {
      await transaction.table("settings").put({ key: "automatic-protection", value: "false" });
    });
  }
}

export const db = new LinkScopeDB();
