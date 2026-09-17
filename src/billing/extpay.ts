import ExtPay from "extpay";
import { db } from "@/src/storage/database";
import { noteUsage } from "@/src/telemetry/usage";

export type BillingStatus = {
  configured: boolean;
  paid: boolean;
  tier: "free" | "pro";
  sandbox: boolean;
  subscriptionStatus?: "active" | "past_due" | "canceled";
  paidAt?: string;
  checkedAt: number;
  verifiedAt?: number;
  error?: string;
};

const BILLING_CACHE_KEY = "linkscope-billing-status";
const BILLING_CACHE_MS = 5 * 60 * 1000;
export const BILLING_OFFLINE_GRACE_MS = 72 * 60 * 60 * 1000;
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

function cacheDurationMs(): number {
  // Test purchases should be reflected as soon as the ExtensionPay success page
  // returns to the extension instead of waiting on the production cache window.
  return isBillingSandbox() ? 0 : BILLING_CACHE_MS;
}

async function cacheStatus(status: BillingStatus): Promise<BillingStatus> {
  await browser.storage.local.set({ [BILLING_CACHE_KEY]: status });
  return status;
}

export function startBillingBackground(): void {
  if (started) return;
  started = true;
  extpay.startBackground();
  extpay.onPaid.addListener(() => { void getBillingStatus(true).catch(console.error); });
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
    if (value && Date.now() - value.checkedAt < cacheDurationMs()) return value;
  }

  try {
    const user = await extpay.getUser();
    if (user.paidAt && !user.paid && (await db.settings.get("history-downgrade-reviewed"))?.value !== "true") {
      await db.settings.put({ key: "history-cleanup-paused", value: "true" });
    }
    if (user.paid) await db.settings.put({ key: "history-downgrade-reviewed", value: "false" });
    return await cacheStatus({
      configured: true,
      paid: user.paid,
      tier: user.paid ? "pro" : "free",
      sandbox: isBillingSandbox(),
      subscriptionStatus: user.subscriptionStatus,
      paidAt: user.paidAt?.toISOString(),
      checkedAt: Date.now(),
      verifiedAt: Date.now(),
    });
  } catch (error) {
    const cached = await browser.storage.local.get(BILLING_CACHE_KEY);
    const previous = cached[BILLING_CACHE_KEY] as BillingStatus | undefined;
    const verifiedAt = previous?.verifiedAt ?? (previous?.error ? undefined : previous?.checkedAt);
    const paid = Boolean(previous?.paid && verifiedAt && Date.now() - verifiedAt <= BILLING_OFFLINE_GRACE_MS);
    await db.settings.put({ key: "history-cleanup-paused", value: "true" });
    const fallback: BillingStatus = {
      configured: true,
      paid,
      tier: paid ? "pro" : "free",
      sandbox: isBillingSandbox(),
      subscriptionStatus: previous?.subscriptionStatus,
      paidAt: previous?.paidAt,
      checkedAt: Date.now(),
      verifiedAt,
      error: error instanceof Error ? error.message : "Could not verify subscription.",
    };
    return await cacheStatus(fallback);
  }
}

export async function openProCheckout(): Promise<void> {
  if (!configuredExtensionPayId) throw new Error("Set WXT_EXTPAY_EXTENSION_ID before opening checkout.");
  await invalidateBillingCache();
  await extpay.openPaymentPage();
  noteUsage("upgrade-opened");
}

export async function openProLogin(): Promise<void> {
  if (!configuredExtensionPayId) throw new Error("Set WXT_EXTPAY_EXTENSION_ID before opening billing login.");
  await invalidateBillingCache();
  await extpay.openLoginPage();
}

async function invalidateBillingCache(): Promise<void> {
  const cached = await browser.storage.local.get(BILLING_CACHE_KEY);
  const value = cached[BILLING_CACHE_KEY] as BillingStatus | undefined;
  if (value) await browser.storage.local.set({ [BILLING_CACHE_KEY]: { ...value, verifiedAt: value.verifiedAt ?? (value.error ? undefined : value.checkedAt), checkedAt: 0 } });
}
