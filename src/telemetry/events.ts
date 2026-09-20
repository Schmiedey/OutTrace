export const USAGE_EVENTS = [
  "consent-enabled",
  "product-opened",
  "manual-scan",
  "first-scan",
  "second-scan",
  "returned-day-7",
  "watchlist-added",
  "share-card-exported",
  "digest-delivered",
  "upgrade-opened",
  "popup-pro-nudge-shown",
  "diff-watch-cta-shown",
  "deep-audit-locked-clicked",
  "audit-limit-locked-clicked",
  "watch-limit-locked-clicked",
  "export-locked-clicked",
  "checkout-started",
  "checkout-completed",
  "client-report-opened",
  "client-report-download-requested",
  "client-report-print-requested",
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];
export type UsageCounts = Partial<Record<UsageEvent, number>>;
export type UsagePayload = { formatVersion: 1; counts: UsageCounts };

const EVENT_SET = new Set<string>(USAGE_EVENTS);

/** Accept only the documented, count-only wire format. */
export function parseUsagePayload(value: unknown): UsagePayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { formatVersion?: unknown; counts?: unknown };
  if (candidate.formatVersion !== 1 || !candidate.counts || typeof candidate.counts !== "object" || Array.isArray(candidate.counts)) return null;
  const entries = Object.entries(candidate.counts as Record<string, unknown>);
  if (entries.length === 0 || entries.length > USAGE_EVENTS.length) return null;
  const counts: UsageCounts = {};
  for (const [event, count] of entries) {
    if (!EVENT_SET.has(event) || !Number.isInteger(count) || (count as number) < 1 || (count as number) > 10_000) return null;
    counts[event as UsageEvent] = count as number;
  }
  return { formatVersion: 1, counts };
}
