import { db } from "@/src/storage/database";
import { USAGE_EVENTS, type UsageCounts, type UsageEvent } from "@/src/telemetry/events";

export { USAGE_EVENTS, type UsageEvent } from "@/src/telemetry/events";
type UsageState = { enabled: boolean; enabledAt: number; scans: number; day7: boolean; totals: UsageCounts; pending: UsageCounts; lastSentAt: number };
const KEY = "usage-counts-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const empty = (): UsageState => ({ enabled: false, enabledAt: 0, scans: 0, day7: false, totals: {}, pending: {}, lastSentAt: 0 });
let activeController: AbortController | undefined;
let activeSend: Promise<boolean> | undefined;

export function usageEndpoint(): string | null {
  const configured = import.meta.env.WXT_USAGE_ENDPOINT?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
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

export async function usageStatus(): Promise<{ enabled: boolean; endpoint: string | null; counts: UsageCounts }> {
  const state = await read();
  return { enabled: state.enabled, endpoint: usageEndpoint(), counts: payloadCounts(state.totals) };
}
function payloadCounts(counts: UsageCounts): UsageCounts {
  return Object.fromEntries(USAGE_EVENTS.filter((event) => Number.isInteger(counts[event]) && (counts[event] ?? 0) > 0).map((event) => [event, Math.min(10_000, counts[event]!)]));
}

export function abortUsageSend(): void {
  activeController?.abort();
  activeController = undefined;
}

async function performUsageSend(force: boolean): Promise<boolean> {
  const endpoint = usageEndpoint();
  if (!endpoint) return false;
  const state = await read();
  const counts = payloadCounts(state.pending);
  if (!state.enabled || Object.keys(counts).length === 0) return false;
  if (!force && state.lastSentAt > 0 && Date.now() - state.lastSentAt < DAY_MS) return false;

  const controller = new AbortController();
  activeController = controller;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formatVersion: 1, counts }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    await db.transaction("rw", db.settings, async () => {
      const latest = await read();
      if (!latest.enabled) return;
      for (const event of USAGE_EVENTS) {
        const sent = counts[event] ?? 0;
        const remaining = (latest.pending[event] ?? 0) - sent;
        if (remaining > 0) latest.pending[event] = remaining;
        else delete latest.pending[event];
      }
      latest.lastSentAt = Date.now();
      await db.settings.put({ key: KEY, value: JSON.stringify(latest) });
    });
    return true;
  } catch {
    return false;
  } finally {
    if (activeController === controller) activeController = undefined;
  }
}

export async function sendUsageCounts(force = false): Promise<boolean> {
  if (activeSend) return await activeSend;
  activeSend = performUsageSend(force);
  try { return await activeSend; }
  finally { activeSend = undefined; }
}

/** Instrumentation must never break scanning, payments, or exports. */
export function noteUsage(event: UsageEvent): void {
  void recordUsage(event).then(() => sendUsageCounts(false)).catch(() => {});
}
