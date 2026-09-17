import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), put: vi.fn(), openPaymentPage: vi.fn(), openLoginPage: vi.fn(), startBackground: vi.fn(), listener: vi.fn() }));
vi.mock("extpay", () => ({ default: () => ({ ...mocks, onPaid: { addListener: mocks.listener } }) }));
vi.mock("@/src/storage/database", () => ({ db: { settings: { put: mocks.put, get: vi.fn().mockResolvedValue(undefined) } } }));
import { BILLING_OFFLINE_GRACE_MS, getBillingStatus, openProCheckout, openProLogin } from "./extpay";

const key = "linkscope-billing-status";
let cache: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(1_000_000_000);
  cache = {};
  mocks.put.mockResolvedValue(undefined);
  vi.stubGlobal("browser", { runtime: { getManifest: () => ({ update_url: "https://clients2.google.com/service/update2/crx" }) }, storage: { local: {
    get: vi.fn(async () => cache), set: vi.fn(async (values) => Object.assign(cache, values)),
  } } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("billing durability", () => {
  it("verifies paid state and preserves the last verification when opening checkout/login", async () => {
    mocks.getUser.mockResolvedValue({ paid: true, paidAt: new Date(1), subscriptionStatus: "active" });
    expect((await getBillingStatus(true)).paid).toBe(true);
    await openProCheckout(); await openProLogin();
    expect(cache[key]).toMatchObject({ paid: true, verifiedAt: Date.now(), checkedAt: 0 });
  });
  it("gives verified paid users a bounded offline grace without extending it on errors", async () => {
    mocks.getUser.mockResolvedValueOnce({ paid: true, paidAt: new Date(1) }).mockRejectedValue(new Error("Offline"));
    const verified = await getBillingStatus(true);
    expect((await getBillingStatus(true)).paid).toBe(true);
    vi.advanceTimersByTime(BILLING_OFFLINE_GRACE_MS + 1);
    const expired = await getBillingStatus(true);
    expect(expired.paid).toBe(false);
    expect(expired.verifiedAt).toBe(verified.verifiedAt);
    expect(mocks.put).toHaveBeenCalledWith({ key: "history-cleanup-paused", value: "true" });
  });
  it("does not grant Pro to an unverified offline installation", async () => {
    mocks.getUser.mockRejectedValue(new Error("Offline"));
    expect((await getBillingStatus(true)).paid).toBe(false);
  });
  it("pauses deletion when a previously paid subscription expires", async () => {
    mocks.getUser.mockResolvedValue({ paid: false, paidAt: new Date(1), subscriptionStatus: "canceled" });
    expect((await getBillingStatus(true)).tier).toBe("free");
    expect(mocks.put).toHaveBeenCalledWith({ key: "history-cleanup-paused", value: "true" });
  });
});
