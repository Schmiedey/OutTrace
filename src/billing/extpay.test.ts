import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  openPaymentPage: vi.fn(),
  openLoginPage: vi.fn(),
  startBackground: vi.fn(),
  onPaid: vi.fn(),
  noteUsage: vi.fn(),
}));
vi.mock("extpay", () => ({
  default: () => ({
    getUser: mocks.getUser,
    openPaymentPage: mocks.openPaymentPage,
    openLoginPage: mocks.openLoginPage,
    startBackground: mocks.startBackground,
    onPaid: { addListener: mocks.onPaid },
  }),
}));
vi.mock("@/src/telemetry/usage", () => ({ noteUsage: mocks.noteUsage }));
import {
  BILLING_CACHE_KEY,
  BILLING_CACHE_MS,
  getBillingStatus,
  openBillingManagement,
  openProCheckout,
  openProLogin,
  startBillingBackground,
} from "./extpay";

let cache: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000_000);
  cache = {};
  mocks.getUser.mockReset();
  mocks.openPaymentPage.mockResolvedValue(undefined);
  mocks.openLoginPage.mockResolvedValue(undefined);
  vi.stubGlobal("browser", {
    runtime: {
      getManifest: () => ({ update_url: "https://clients2.google.com/service/update2/crx" }),
      getURL: (path: string) => `chrome-extension://test${path}`,
    },
    storage: {
      local: {
        get: vi.fn(async () => cache),
        set: vi.fn(async (values) => Object.assign(cache, values)),
        remove: vi.fn(async (key: string) => { delete cache[key]; }),
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("one-time ExtensionPay billing", () => {
  it("starts the provider once and returns the checkout tab after payment", async () => {
    let updatedCallback: ((tabId: number, changeInfo: { url?: string }, tab: { url?: string }) => void) | undefined;
    const tabs = {
      query: vi.fn(async () => [{ id: 42, url: "https://extensionpay.com/extension/linkscope/choose-plan" }]),
      update: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      onUpdated: { addListener: vi.fn((callback) => { updatedCallback = callback; }) },
    };
    (globalThis as typeof globalThis & { browser: { tabs: typeof tabs } }).browser.tabs = tabs;

    expect(() => startBillingBackground()).not.toThrow();
    expect(mocks.startBackground).toHaveBeenCalledOnce();
    expect(mocks.onPaid).not.toHaveBeenCalled();

    mocks.getUser.mockResolvedValue({
      paid: true,
      paidAt: new Date(1),
      plan: { unitAmountCents: 1499, currency: "usd", nickname: "pro", interval: "once", intervalCount: null },
    });
    await openProCheckout();
    await updatedCallback?.(99, {
      url: "https://extensionpay.com/extension/linkscope/paid",
    }, {
      url: "https://extensionpay.com/extension/linkscope/paid",
    });
    await vi.waitFor(() => {
      expect(tabs.update).toHaveBeenCalledWith(99, {
        url: "chrome-extension://test/app.html#/pro?billing=success",
        active: true,
      });
    });
  });

  it("uses the paid user and caches the one-time plan locally", async () => {
    mocks.getUser.mockResolvedValue({
      paid: true,
      paidAt: new Date(1),
      plan: { unitAmountCents: 1499, currency: "usd", nickname: null, interval: "once", intervalCount: null },
    });

    const status = await getBillingStatus(true);
    expect(status).toMatchObject({ paid: true, tier: "pro", paymentType: "once", plan: { interval: "once", unitAmountCents: 1499 } });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect((await getBillingStatus()).paid).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledOnce();

    await openProCheckout();
    await openProLogin();
    await openBillingManagement();
    expect(mocks.openPaymentPage).toHaveBeenCalledOnce();
    expect(mocks.openLoginPage).toHaveBeenCalledTimes(2);
    expect(mocks.noteUsage).toHaveBeenCalledWith("upgrade-opened");
    expect(mocks.noteUsage).toHaveBeenCalledWith("billing-management-opened");
    expect(cache[BILLING_CACHE_KEY]).toMatchObject({ paid: true, checkedAt: 0 });
  });

  it("refreshes after the cache interval instead of contacting ExtensionPay per scan", async () => {
    mocks.getUser.mockResolvedValue({ paid: false, paidAt: null, plan: null });
    expect((await getBillingStatus(true)).paid).toBe(false);
    expect((await getBillingStatus()).paid).toBe(false);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(BILLING_CACHE_MS + 1);
    expect((await getBillingStatus()).paid).toBe(false);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("keeps a verified one-time purchase active during a temporary provider failure", async () => {
    cache[BILLING_CACHE_KEY] = {
      configured: true,
      paid: true,
      tier: "pro",
      sandbox: false,
      paymentType: "once",
      checkedAt: 1,
      verifiedAt: 1,
    };
    mocks.getUser.mockRejectedValue(new Error("Offline"));
    const status = await getBillingStatus(true);
    expect(status.paid).toBe(true);
    expect(status.error).toBe("Offline");
  });

  it("accepts the provider's unpaid state after a test reset", async () => {
    cache[BILLING_CACHE_KEY] = {
      configured: true,
      paid: true,
      tier: "pro",
      sandbox: true,
      paymentType: "once",
      checkedAt: 1,
    };
    mocks.getUser.mockResolvedValue({ paid: false, paidAt: null, plan: null });
    const status = await getBillingStatus(true);
    expect(status.paid).toBe(false);
    expect(status.tier).toBe("free");
  });
});
