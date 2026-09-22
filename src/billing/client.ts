import type { BillingStatus } from "@/src/billing/extpay";

type BillingResponse = { ok?: boolean; status?: BillingStatus; error?: string };
const BILLING_ORIGIN = "https://extensionpay.com/*";

async function requestBillingAccess(): Promise<void> {
  const permission = { origins: [BILLING_ORIGIN] };
  if (await browser.permissions.contains(permission)) return;
  const granted = await browser.permissions.request(permission);
  if (!granted) {
    throw new Error(
      "OutTrace needs access to extensionpay.com only to open checkout or restore a purchase.",
    );
  }
}

export async function billingStatus(force = false): Promise<BillingStatus> {
  const response = (await browser.runtime.sendMessage({ type: "GET_BILLING_STATUS", force })) as BillingResponse;
  if (!response?.ok || !response.status) throw new Error(response?.error ?? "Could not check Pro status.");
  return response.status;
}

export async function launchCheckout(): Promise<void> {
  await requestBillingAccess();
  const response = (await browser.runtime.sendMessage({ type: "OPEN_PRO_CHECKOUT" })) as BillingResponse;
  if (!response?.ok) throw new Error(response?.error ?? "Could not open checkout.");
}

export async function launchLogin(): Promise<void> {
  await requestBillingAccess();
  const response = (await browser.runtime.sendMessage({ type: "OPEN_PRO_LOGIN" })) as BillingResponse;
  if (!response?.ok) throw new Error(response?.error ?? "Could not open account login.");
}

export async function launchManageBilling(): Promise<void> {
  await requestBillingAccess();
  const response = (await browser.runtime.sendMessage({ type: "OPEN_BILLING_MANAGEMENT" })) as BillingResponse;
  if (!response?.ok) throw new Error(response?.error ?? "Could not open billing management.");
}
