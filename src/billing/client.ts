import type { BillingStatus } from "@/src/billing/extpay";

type BillingResponse = { ok?: boolean; status?: BillingStatus; error?: string };

export async function billingStatus(force = false): Promise<BillingStatus> {
  const response = (await browser.runtime.sendMessage({ type: "GET_BILLING_STATUS", force })) as BillingResponse;
  if (!response?.ok || !response.status) throw new Error(response?.error ?? "Could not check Pro status.");
  return response.status;
}

export async function launchCheckout(): Promise<void> {
  const response = (await browser.runtime.sendMessage({ type: "OPEN_PRO_CHECKOUT" })) as BillingResponse;
  if (!response?.ok) throw new Error(response?.error ?? "Could not open checkout.");
}

export async function launchLogin(): Promise<void> {
  const response = (await browser.runtime.sendMessage({ type: "OPEN_PRO_LOGIN" })) as BillingResponse;
  if (!response?.ok) throw new Error(response?.error ?? "Could not open account login.");
}
