import { db } from "@/src/storage/database";

export const USAGE_EVENTS = ["consent-enabled", "product-opened", "manual-scan", "first-scan", "second-scan", "returned-day-7", "watchlist-added", "share-card-exported", "digest-delivered", "upgrade-opened", "deep-audit-locked-clicked", "audit-limit-locked-clicked", "export-locked-clicked", "checkout-started", "checkout-completed"] as const;
export type UsageEvent = (typeof USAGE_EVENTS)[number];
type Counts = Partial<Record<UsageEvent, number>>;
type UsageState = { enabled: boolean; enabledAt: number; scans: number; day7: boolean; totals: Counts; pending: Counts; lastSentAt: number };
const KEY = "usage-counts-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const empty = (): UsageState => ({ enabled: false, enabledAt: 0, scans: 0, day7: false, totals: {}, pending: {}, lastSentAt: 0 });

export function usageEndpoint(): string | null {
  // Local-only product: even an old environment override cannot enable reporting.
  return null;
}

async function read(): Promise<UsageState> {
  const row = await db.settings.get(KEY);
  if (!row) return empty();
  try { return { ...empty(), ...JSON.parse(row.value) }; } catch { return empty(); }
}
function increment(state: UsageState, event: UsageEvent): void {
  state.totals[event] = Math.min(10_000, (state.totals[event] ?? 0) + 1);
  state.pending[event] = Math.min(10_000, (state.pending[event] ?? 0) + 1);
}

export async function setUsageConsent(enabled: boolean): Promise<void> {
  if (!enabled) abortUsageSend();
  await db.transaction("rw", db.settings, async () => {
    const state = empty();
    state.enabled = enabled; state.enabledAt = enabled ? Date.now() : 0;
    if (enabled) increment(state, "consent-enabled");
    // Revocation erases counters and the unsent queue, including any prior consent session.
    await db.settings.put({ key: KEY, value: JSON.stringify(state) });
  });
}

/** Fixed enum only. Never accepts event properties, identifiers, URLs, or domains. */
export async function recordUsage(event: UsageEvent): Promise<void> {
  if (!USAGE_EVENTS.includes(event)) return;
  await db.transaction("rw", db.settings, async () => {
    const state = await read();
    if (!state.enabled) return;
    increment(state, event);
    if (event === "manual-scan") {
      state.scans += 1;
      if (state.scans === 1) increment(state, "first-scan");
      if (state.scans === 2) increment(state, "second-scan");
    }
    if (event === "product-opened" && !state.day7 && Date.now() - state.enabledAt >= 7 * DAY_MS && Date.now() - state.enabledAt < 14 * DAY_MS) {
      state.day7 = true; increment(state, "returned-day-7");
    }
    await db.settings.put({ key: KEY, value: JSON.stringify(state) });
  });
}

export async function usageStatus(): Promise<{ enabled: boolean; endpoint: string | null; counts: Counts }> {
  const state = await read();
  return { enabled: state.enabled, endpoint: usageEndpoint(), counts: payloadCounts(state.totals) };
}
function payloadCounts(counts: Counts): Counts {
  return Object.fromEntries(USAGE_EVENTS.filter((event) => Number.isInteger(counts[event]) && (counts[event] ?? 0) > 0).map((event) => [event, Math.min(10_000, counts[event]!)]));
}

export function abortUsageSend(): void { /* No network sender exists. */ }
export async function sendUsageCounts(_force = false): Promise<boolean> { return false; }

/** Instrumentation must never break scanning, payments, or exports. */
export function noteUsage(event: UsageEvent): void { void recordUsage(event).catch(() => {}); }
