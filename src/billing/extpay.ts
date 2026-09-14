import ExtPay from "extpay";

export type BillingStatus = {
  configured: boolean;
  paid: boolean;
  tier: "free" | "pro";
  sandbox: boolean;
  subscriptionStatus?: "active" | "past_due" | "canceled";
  paidAt?: string;
  checkedAt: number;
  error?: string;
};

const BILLING_CACHE_KEY = "linkscope-billing-status";
const BILLING_CACHE_MS = 5 * 60 * 1000;
// The product slug is public configuration. Keep the env override for forks,
// but make the published LinkScope build work from a clean clone as well.
const extensionPayId = import.meta.env.WXT_EXTPAY_EXTENSION_ID || "linkscope";
const configuredExtensionPayId = extensionPayId;
const extpay = ExtPay(extensionPayId);
let started = false;

export function isBillingSandbox(): boolean {
  const manifest = browser.runtime.getManifest() as { update_url?: string };
  return !manifest.update_url;
}

async function cacheStatus(status: BillingStatus): Promise<BillingStatus> {
  await browser.storage.local.set({ [BILLING_CACHE_KEY]: status });
  return status;
}

export function startBillingBackground(): void {
  if (started) return;
  started = true;
  extpay.startBackground();
}

export async function getBillingStatus(force = false): Promise<BillingStatus> {
  if (!configuredExtensionPayId) {
    return {
      configured: false,
      paid: false,
      tier: "free",
      sandbox: isBillingSandbox(),
      checkedAt: Date.now(),
      error: "Billing setup required: set WXT_EXTPAY_EXTENSION_ID to your registered ExtensionPay product slug.",
    };
  }
  if (!force) {
    const cached = await browser.storage.local.get(BILLING_CACHE_KEY);
    const value = cached[BILLING_CACHE_KEY] as BillingStatus | undefined;
    if (value && Date.now() - value.checkedAt < BILLING_CACHE_MS) return value;
  }

  try {
    const user = await extpay.getUser();
    return await cacheStatus({
      configured: true,
      paid: user.paid,
      tier: user.paid ? "pro" : "free",
      sandbox: isBillingSandbox(),
      subscriptionStatus: user.subscriptionStatus,
      paidAt: user.paidAt?.toISOString(),
      checkedAt: Date.now(),
    });
  } catch (error) {
    const cached = await browser.storage.local.get(BILLING_CACHE_KEY);
    const previous = cached[BILLING_CACHE_KEY] as BillingStatus | undefined;
    const fallback: BillingStatus = {
      configured: true,
      paid: previous?.paid ?? false,
      tier: previous?.tier ?? "free",
      sandbox: isBillingSandbox(),
      subscriptionStatus: previous?.subscriptionStatus,
      paidAt: previous?.paidAt,
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : "Could not verify subscription.",
    };
    return await cacheStatus(fallback);
  }
}

export async function openProCheckout(): Promise<void> {
  if (!configuredExtensionPayId) throw new Error("Set WXT_EXTPAY_EXTENSION_ID before opening checkout.");
  await extpay.openPaymentPage();
}

export async function openProLogin(): Promise<void> {
  if (!configuredExtensionPayId) throw new Error("Set WXT_EXTPAY_EXTENSION_ID before opening billing login.");
  await extpay.openLoginPage();
}
