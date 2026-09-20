import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/src/storage/database";
import { recordUsage, setUsageConsent, usageStatus, usageEndpoint, sendUsageCounts } from "./usage";

beforeEach(async () => {
  await db.open(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(1_000_000_000);
  vi.stubEnv("WXT_USAGE_ENDPOINT", "");
  vi.stubGlobal("browser", { permissions: { contains: vi.fn().mockResolvedValue(true) } });
});
afterEach(async () => { await db.delete(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("strict opt-in aggregate usage", () => {
  it("collects nothing before consent and keeps counts local without a receiver", async () => {
    await recordUsage("manual-scan");
    expect((await usageStatus()).counts).toEqual({});
    await setUsageConsent(true); await recordUsage("manual-scan");
    expect(await sendUsageCounts(true)).toBe(false);
  });
  it("records fixed funnel milestones once and erases them on revocation", async () => {
    await setUsageConsent(true);
    await Promise.all([recordUsage("manual-scan"), recordUsage("manual-scan"), recordUsage("manual-scan")]);
    vi.setSystemTime(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await recordUsage("product-opened"); await recordUsage("product-opened");
    expect((await usageStatus()).counts).toMatchObject({ "first-scan": 1, "second-scan": 1, "manual-scan": 3, "returned-day-7": 1 });
    await setUsageConsent(false); await recordUsage("manual-scan");
    expect((await usageStatus()).counts).toEqual({});
  });
  it("posts only allowlisted aggregate counts to a configured HTTPS receiver", async () => {
    vi.stubEnv("WXT_USAGE_ENDPOINT", "https://counts.example.test/aggregate");
    const request = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", request);
    await setUsageConsent(true); await recordUsage("watchlist-added");
    expect(usageEndpoint()).toBe("https://counts.example.test/aggregate");
    expect((await usageStatus()).counts).toEqual({ "consent-enabled": 1, "watchlist-added": 1 });
    expect(await sendUsageCounts(true)).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    const [, options] = request.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ formatVersion: 1, counts: { "consent-enabled": 1, "watchlist-added": 1 } });
    expect(String(options.body)).not.toMatch(/domain|url|timestamp|install/i);
    expect(await sendUsageCounts(true)).toBe(false);
  });
  it("rejects unsafe endpoints and retains counts after a failed send", async () => {
    vi.stubEnv("WXT_USAGE_ENDPOINT", "http://counts.example.test/aggregate"); expect(usageEndpoint()).toBeNull();
    vi.stubEnv("WXT_USAGE_ENDPOINT", "https://counts.example.test/aggregate?token=secret"); expect(usageEndpoint()).toBeNull();
    vi.stubEnv("WXT_USAGE_ENDPOINT", "https://counts.example.test/aggregate"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await setUsageConsent(true);
    expect(await sendUsageCounts(true)).toBe(false);
    expect((await usageStatus()).counts["consent-enabled"]).toBe(1);
  });
});
