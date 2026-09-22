import ExtPay from "extpay";
import { noteUsage } from "@/src/telemetry/usage";

export type BillingPlan = {
  unitAmountCents: number;
  currency: string;
  nickname: string | null;
  interval: "month" | "year" | "once";
  intervalCount: number | null;
};

export type BillingStatus = {
  configured: boolean;
  paid: boolean;
  tier: "free" | "pro";
  sandbox: boolean;
  /** The registered product is intended to use ExtensionPay's one-time plan. */
  paymentType: "once" | "unknown";
  plan?: BillingPlan;
  paidAt?: string;
  /** Set when a cached free state first changes to paid. */
  unlockedAt?: number;
  checkedAt: number;
  verifiedAt?: number;
  error?: string;
};

export const BILLING_CACHE_KEY = "linkscope-billing-status";
export const BILLING_CACHE_MS = 24 * 60 * 60 * 1000;
const BILLING_RETURN_TAB_KEY = "linkscope-billing-return-tab";
const BILLING_RETURN_TAB_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BILLING_SUCCESS_URL = "/app.html#/pro?billing=success";
const BILLING_PROVIDER_URLS = [
  "https://extensionpay.com/*",
  "https://checkout.stripe.com/*",
  "https://billing.stripe.com/*",
];

// The product slug is public configuration. Keep the env override for forks,
// but make the published OutTrace build work from a clean clone as well.
const extensionPayId = (import.meta.env.WXT_EXTPAY_EXTENSION_ID || "linkscope").trim();
const configuredExtensionPayId = extensionPayId;
const extpay = ExtPay(extensionPayId);
let started = false;
let paymentReturnInFlight = false;
let paymentTabListenerInstalled = false;

type ExtPayUser = {
  paid: boolean;
  paidAt?: Date | string | null;
  plan?: BillingPlan | null;
};

export function isBillingSandbox(): boolean {
  const manifest = browser.runtime.getManifest() as { update_url?: string };
  return !manifest.update_url;
}

function planFromUser(user: ExtPayUser): BillingPlan | undefined {
  if (!user.plan || typeof user.plan !== "object") return undefined;
  const plan = user.plan;
  if (
    typeof plan.unitAmountCents !== "number" ||
    typeof plan.currency !== "string" ||
    (plan.interval !== "once" && plan.interval !== "month" && plan.interval !== "year")
  )
    return undefined;
  return {
    unitAmountCents: plan.unitAmountCents,
    currency: plan.currency,
    nickname: typeof plan.nickname === "string" ? plan.nickname : null,
    interval: plan.interval,
    intervalCount: typeof plan.intervalCount === "number" ? plan.intervalCount : null,
  };
}

function statusFromUser(user: ExtPayUser, previous: BillingStatus | undefined): BillingStatus {
  const plan = planFromUser(user);
  const paidAt = user.paidAt instanceof Date
    ? (Number.isNaN(user.paidAt.getTime()) ? undefined : user.paidAt.toISOString())
    : typeof user.paidAt === "string" && Number.isFinite(Date.parse(user.paidAt))
      ? new Date(user.paidAt).toISOString()
      : undefined;
  const unlockedAt =
    user.paid && previous?.paid === false
      ? Date.now()
      : previous?.unlockedAt;
  return {
    configured: true,
    paid: user.paid === true,
    tier: user.paid === true ? "pro" : "free",
    sandbox: isBillingSandbox(),
    paymentType: plan?.interval === "once" ? "once" : "unknown",
    plan,
    paidAt,
    unlockedAt,
    checkedAt: Date.now(),
    verifiedAt: Date.now(),
  };
}

async function readCachedStatus(): Promise<BillingStatus | undefined> {
  const cached = await browser.storage.local.get(BILLING_CACHE_KEY);
  const value = cached[BILLING_CACHE_KEY] as BillingStatus | undefined;
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.checkedAt !== "number" || typeof value.paid !== "boolean") return undefined;
  return {
    ...value,
    configured: value.configured !== false,
    tier: value.paid ? "pro" : "free",
    sandbox: value.sandbox === true,
    paymentType: value.paymentType === "once" ? "once" : "unknown",
  };
}

async function cacheStatus(status: BillingStatus): Promise<BillingStatus> {
  await browser.storage.local.set({ [BILLING_CACHE_KEY]: status });
  return status;
}

type BillingReturnState = {
  tabId?: number;
  fallbackTabId?: number;
  openedAt: number;
};

async function rememberBillingReturnTab(): Promise<void> {
  try {
    if (!browser.tabs?.query) return;
    const currentTabs = await browser.tabs.query({ active: true, currentWindow: true });
    const sourceTab = currentTabs.find((candidate) => candidate.id !== undefined);
    const openedAt = Date.now();
    const previous = await browser.storage.local.get(BILLING_RETURN_TAB_KEY);
    const previousState = previous[BILLING_RETURN_TAB_KEY] as BillingReturnState | undefined;
    const sourceIsProviderTab = sourceTab?.url?.startsWith("https://extensionpay.com/") === true ||
      sourceTab?.url?.startsWith("https://checkout.stripe.com/") === true ||
      sourceTab?.url?.startsWith("https://billing.stripe.com/") === true;
    const fallbackTabId = sourceIsProviderTab
      ? previousState?.fallbackTabId
      : sourceTab?.id;
    // Save the OutTrace tab before opening hosted checkout. If the provider
    // navigates through Stripe before the tab query catches up, this gives us
    // a reliable tab to bring back to the app.
    if (sourceTab?.id !== undefined || fallbackTabId !== undefined) {
      await browser.storage.local.set({
        [BILLING_RETURN_TAB_KEY]: { tabId: sourceTab?.id ?? fallbackTabId, fallbackTabId, openedAt },
      });
    }
    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activePaymentTabs = activeTabs.filter((candidate) => candidate.url?.startsWith("https://extensionpay.com/"));
    const paymentTabs = activePaymentTabs.length > 0
      ? activePaymentTabs
      : await browser.tabs.query({ url: BILLING_PROVIDER_URLS });
    const tab = paymentTabs[paymentTabs.length - 1];
    if (tab?.id === undefined) return;
    await browser.storage.local.set({
      [BILLING_RETURN_TAB_KEY]: {
        tabId: tab.id,
        fallbackTabId,
        openedAt,
      },
    });
  } catch {
    // A browser that cannot expose tabs can still complete the payment. The
    // onPaid callback will open the confirmation page as a last resort.
  }
}

async function returnToOutTraceAfterPayment(completedTabId?: number): Promise<void> {
  const url = browser.runtime.getURL(BILLING_SUCCESS_URL);
  const candidateTabIds: number[] = [];
  try {
    const stored = await browser.storage.local.get(BILLING_RETURN_TAB_KEY);
    const value = stored[BILLING_RETURN_TAB_KEY] as BillingReturnState | undefined;
    if (
      typeof value?.openedAt === "number" &&
      Date.now() - value.openedAt <= BILLING_RETURN_TAB_MAX_AGE_MS
    ) {
      if (typeof value.tabId === "number") candidateTabIds.push(value.tabId);
      if (typeof value.fallbackTabId === "number") candidateTabIds.push(value.fallbackTabId);
    }
  } catch {
    // Fall back to opening a fresh dashboard tab below.
  }

  if (completedTabId !== undefined) candidateTabIds.unshift(completedTabId);
  const uniqueTabIds = [...new Set(candidateTabIds)];
  if (browser.tabs?.update) {
    for (const tabId of uniqueTabIds) {
      try {
        await browser.tabs.update(tabId, { url, active: true });
        await browser.storage.local.remove?.(BILLING_RETURN_TAB_KEY);
        return;
      } catch {
        // The checkout or source tab may have been closed; try the next one.
      }
    }
  }

  // A successful provider callback is itself proof that this was a payment or
  // restore flow. Never leave the user stranded on Stripe if the original tab
  // disappeared while the checkout was completing.
  try {
    await browser.tabs?.create?.({ url, active: true });
    await browser.storage.local.remove?.(BILLING_RETURN_TAB_KEY);
  } catch {
    // Entitlement is already cached; do not make a payment callback fail just
    // because a browser cannot open a tab.
  }
}

async function handlePaidReturn(completedTabId?: number): Promise<void> {
  if (paymentReturnInFlight) return;
  paymentReturnInFlight = true;
  try {
    const status = await getBillingStatus(true).catch(() => undefined);
    if (status?.paid !== true) return;
    noteUsage("checkout-completed");
    await returnToOutTraceAfterPayment(completedTabId);
  } finally {
    paymentReturnInFlight = false;
  }
}

function isPaidReturnUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://extensionpay.com" &&
      parsed.pathname === `/extension/${extensionPayId}/paid`;
  } catch {
    return false;
  }
}

function isStripeBillingUrl(url: string | undefined): boolean {
  return url?.startsWith("https://checkout.stripe.com/") === true ||
    url?.startsWith("https://billing.stripe.com/") === true;
}

async function isPendingPaymentTab(tabId: number): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(BILLING_RETURN_TAB_KEY);
    const value = stored[BILLING_RETURN_TAB_KEY] as BillingReturnState | undefined;
    return typeof value?.openedAt === "number" &&
      Date.now() - value.openedAt <= BILLING_RETURN_TAB_MAX_AGE_MS &&
      (value.tabId === tabId || value.fallbackTabId === tabId);
  } catch {
    return false;
  }
}

function installPaymentTabListener(): void {
  if (paymentTabListenerInstalled || !browser.tabs?.onUpdated?.addListener) return;
  paymentTabListenerInstalled = true;
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url ?? tab.url;
    if (isPaidReturnUrl(url)) {
      void handlePaidReturn(tabId).catch(() => undefined);
      return;
    }
    if (!isStripeBillingUrl(url)) return;
    void isPendingPaymentTab(tabId).then(async (pending) => {
      if (!pending) return;
      const status = await getBillingStatus(true).catch(() => undefined);
      if (status?.paid === true) await handlePaidReturn(tabId);
    }).catch(() => undefined);
  });
}

export function startBillingBackground(): void {
  if (started) return;
  started = true;
  installPaymentTabListener();
  try {
    // ExtensionPay owns the payment/license plumbing. This must run once in
    // the service worker, never from a message callback.
    extpay.startBackground();
  } catch (error) {
    // A provider setup problem must not take down the scan worker.
    console.warn(error instanceof Error ? error.message : String(error));
  }
  // Payment completion is detected by the provider-tab listener above. This
  // avoids a required extensionpay.com content script and its install warning.
}

export async function getBillingStatus(force = false): Promise<BillingStatus> {
  if (!configuredExtensionPayId) {
    return {
      configured: false,
      paid: false,
      tier: "free",
      sandbox: isBillingSandbox(),
      paymentType: "unknown",
      checkedAt: Date.now(),
      error: "Billing setup required: set WXT_EXTPAY_EXTENSION_ID to your registered ExtensionPay product slug.",
    };
  }

  const cached = await readCachedStatus();
  if (!force && cached && Date.now() - cached.checkedAt < BILLING_CACHE_MS) return cached;

  try {
    const user = (await extpay.getUser()) as ExtPayUser;
    return await cacheStatus(statusFromUser(user, cached));
  } catch (error) {
    // One-time purchases do not expire. Preserve a previously verified paid
    // state across a temporary provider/network failure, while exposing the
    // error so the UI can offer a manual retry.
    const fallback: BillingStatus = {
      configured: true,
      paid: cached?.paid === true,
      tier: cached?.paid === true ? "pro" : "free",
      sandbox: isBillingSandbox(),
      paymentType: cached?.paymentType ?? "unknown",
      plan: cached?.plan,
      paidAt: cached?.paidAt,
      unlockedAt: cached?.unlockedAt,
      checkedAt: Date.now(),
      verifiedAt: cached?.verifiedAt,
      error: error instanceof Error ? error.message : "Could not verify the Pro purchase.",
    };
    return await cacheStatus(fallback);
  }
}

export async function openProCheckout(): Promise<void> {
  if (!configuredExtensionPayId) throw new Error("Set WXT_EXTPAY_EXTENSION_ID before opening checkout.");
  await invalidateBillingCache();
  await rememberBillingReturnTab();
  await extpay.openPaymentPage();
  await rememberBillingReturnTab();
  noteUsage("upgrade-opened");
  noteUsage("checkout-started");
}

export async function openProLogin(): Promise<void> {
  if (!configuredExtensionPayId) throw new Error("Set WXT_EXTPAY_EXTENSION_ID before restoring a Pro purchase.");
  await invalidateBillingCache();
  await rememberBillingReturnTab();
  await extpay.openLoginPage();
  await rememberBillingReturnTab();
}

/** ExtensionPay account page for receipts, restore, and billing help. */
export async function openBillingManagement(): Promise<void> {
  if (!configuredExtensionPayId) {
    throw new Error("Set WXT_EXTPAY_EXTENSION_ID before opening billing management.");
  }
  await invalidateBillingCache();
  await rememberBillingReturnTab();
  await extpay.openLoginPage();
  await rememberBillingReturnTab();
  noteUsage("billing-management-opened");
}

async function invalidateBillingCache(): Promise<void> {
  const cached = await readCachedStatus();
  if (!cached) return;
  // Keep the last paid value for offline durability, but force the next
  // entitlement read to contact ExtensionPay after checkout or restore.
  await browser.storage.local.set({
    [BILLING_CACHE_KEY]: { ...cached, checkedAt: 0 },
  });
}
