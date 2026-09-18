import type {
  ConnectionType,
  DomainCategory,
  GraphEdgeRecord,
  GraphNodeRecord,
} from "@/src/types/graph";

export type AuditStatus = "discovering" | "running" | "completed" | "cancelled" | "failed";
export type AuditPageStatus = "queued" | "scanning" | "completed" | "failed" | "skipped";
export type AuditMode = "quick" | "standard" | "deep";

export type AuditModeConfig = {
  mode: AuditMode;
  label: string;
  maxPages: number;
  waitMs: number;
};

export const AUDIT_MODES: Record<AuditMode, AuditModeConfig> = {
  quick: { mode: "quick", label: "Quick", maxPages: 10, waitMs: 750 },
  standard: { mode: "standard", label: "Standard", maxPages: 50, waitMs: 1_000 },
  deep: { mode: "deep", label: "Deep", maxPages: 200, waitMs: 2_000 },
};

export type AuditRow = {
  id?: number;
  domain: string;
  rootUrl: string;
  startedAt: number;
  completedAt?: number;
  status: AuditStatus;
  mode: AuditMode;
  /** Internal marker so a running Free audit can resume after a worker restart. */
  freeAuditClaimed?: boolean;
  maxPages: number;
  waitMs: number;
  pagesDiscovered: number;
  pagesScanned: number;
  pagesFailed: number;
  uniqueDomains: number;
  thirdPartyCount: number;
  trackerCount: number;
  unknownCount: number;
  ownerCount: number;
  averagePageScore?: number;
  footprintScore?: number;
  score?: number;
  previousAuditId?: number;
  currentUrl?: string;
  error?: string;
};

export type AuditPageRow = {
  id?: number;
  auditId: number;
  url: string;
  path: string;
  title: string;
  status: AuditPageStatus;
  scannedAt?: number;
  thirdPartyCount: number;
  trackerCount: number;
  unknownCount: number;
  score?: number;
  error?: string;
};

export type AuditPageGraphRow = {
  pageId: number;
  auditId: number;
  originDomain: string;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
};

export type AuditDomainRow = {
  auditId: number;
  domain: string;
  category: DomainCategory;
  owner?: string;
  pageCount: number;
  referenceCount: number;
  pages: string[];
  types: ConnectionType[];
  listed: boolean;
  isFirstParty: boolean;
};

export type AuditProgress = {
  auditId: number;
  status: AuditStatus;
  currentUrl?: string;
  pagesDiscovered: number;
  pagesScanned: number;
  pagesFailed: number;
  thirdPartyCount: number;
  trackerCount: number;
  unknownCount: number;
  recentlyFound: string[];
};
