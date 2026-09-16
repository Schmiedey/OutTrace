export const CONNECTION_TYPES = [
  "link",
  "script",
  "image",
  "iframe",
  "stylesheet",
  "font",
  "media",
  "network",
  "other",
] as const;

export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const DOMAIN_CATEGORIES = [
  "origin",
  "analytics",
  "advertising",
  "payments",
  "cdn",
  "hosting",
  "authentication",
  "social",
  "media",
  "security",
  "support",
  "infrastructure",
  "telemetry",
  "unknown",
] as const;

export type DomainCategory = (typeof DOMAIN_CATEGORIES)[number];

export type ClassificationSource = "curated-list" | "heuristic" | "unknown" | "first-party";
export type ClassificationConfidence = "high" | "medium" | "low";

export type RawFinding = {
  type: ConnectionType;
  url: string;
  snippet: string;
  context?: string;
  initiatorUrl?: string;
  documentUrl?: string;
};

export type RawScanPayload = {
  url: string;
  title: string;
  hostname: string;
  findings: RawFinding[];
};

export type Evidence = {
  type: ConnectionType;
  url: string;
  hostname: string;
  snippet: string;
  context?: string;
};

export type GraphNodeRecord = {
  id: string;
  domain: string;
  category: DomainCategory;
  isOrigin: boolean;
  isSite: boolean;
  isFirstParty: boolean;
  referenceCount: number;
  hostnames: string[];
  owner?: string;
  listed?: boolean;
  classificationSource?: ClassificationSource;
  classificationConfidence?: ClassificationConfidence;
};

export type GraphEdgeRecord = {
  id: string;
  source: string;
  target: string;
  type: ConnectionType;
  count: number;
  evidence: Evidence[];
};

export type ScanGraphSnapshot = {
  scanId: number;
  originDomain: string;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
};

export type SiteRow = {
  id?: number;
  domain: string;
  firstSeen: number;
  lastSeen: number;
  scanCount: number;
};

export type CaptureMode = "snapshot" | "watch" | "scheduled" | "automatic";

export type ScanRow = {
  id?: number;
  siteId: number;
  url: string;
  title: string;
  domain: string;
  timestamp: number;
  nodeCount: number;
  edgeCount: number;
  thirdPartyCount: number;
  trackerCount: number;
  captureMode?: CaptureMode;
  durationMs?: number;
  privacyScore?: number;
  unknownCount?: number;
  iframeCount?: number;
};

export type AlertKind = "new-trackers" | "tracker-surge" | "followed-seen" | "watched-site-change";

export type AlertRow = {
  id?: number;
  siteId: number;
  siteDomain: string;
  fromScanId: number;
  toScanId: number;
  timestamp: number;
  kind: AlertKind;
  addedTrackers: string[];
  removedTrackers: string[];
  addedDomains?: string[];
  removedDomains?: string[];
  trackerDelta: number;
  read: boolean;
};

export type WatchedSiteSchedule = "daily" | "weekly";

export type WatchedSiteRow = {
  domain: string;
  url: string;
  schedule: WatchedSiteSchedule;
  enabled: boolean;
  createdAt: number;
  nextRunAt: number;
  lastRunAt?: number;
  lastScanId?: number;
  lastError?: string;
};

export type SettingRow = {
  key: string;
  value: string;
};

export type ScanGraphRow = {
  scanId: number;
  originDomain: string;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
};

export type DomainRow = {
  domain: string;
  category: DomainCategory;
  firstSeen: number;
  lastSeen: number;
  seenOnCount: number;
  referenceCount: number;
};

export type SightingRow = {
  id?: number;
  domain: string;
  siteId: number;
  siteDomain: string;
  types: ConnectionType[];
  lastScanId: number;
  lastSeen: number;
};

export const TRACKER_CATEGORIES: ReadonlySet<DomainCategory> = new Set([
  "analytics",
  "advertising",
  "telemetry",
]);

export const INFRA_CATEGORIES: ReadonlySet<DomainCategory> = new Set([
  "cdn",
  "infrastructure",
  "hosting",
]);

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  link: "Links",
  script: "Scripts",
  image: "Images",
  iframe: "Iframes",
  stylesheet: "Styles",
  font: "Fonts",
  media: "Media",
  network: "Network",
  other: "Other",
};

export const CATEGORY_LABELS: Record<DomainCategory, string> = {
  origin: "Current website",
  analytics: "Analytics",
  advertising: "Advertising",
  payments: "Payments",
  cdn: "CDN",
  hosting: "Hosting",
  authentication: "Authentication",
  social: "Social",
  media: "Media host",
  security: "Security",
  support: "Customer support",
  infrastructure: "Infrastructure",
  telemetry: "Telemetry",
  unknown: "Unknown",
};
