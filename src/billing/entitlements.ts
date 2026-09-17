import type { BillingStatus } from "@/src/billing/extpay";

export type ProFeature =
  | "deep-scan"
  | "deep-audit"
  | "scheduled-checks"
  | "unlimited-watched-sites"
  | "export"
  | "extended-history";

const PRO_MESSAGES: Record<ProFeature, string> = {
  "deep-scan": "Single-page scans are free.",
  "deep-audit": "Deep audits require LinkScope Pro.",
  "scheduled-checks": "Scheduled background checks require LinkScope Pro.",
  "unlimited-watched-sites": "Free includes one watched site. Upgrade to Pro for unlimited sites.",
  export: "Export requires LinkScope Pro.",
  "extended-history": "Extended history requires LinkScope Pro.",
};

export function requirePro(status: Pick<BillingStatus, "paid">, feature: ProFeature): void {
  if (feature === "deep-scan" || feature === "extended-history") return;
  if (!status.paid) throw new Error(PRO_MESSAGES[feature]);
}

export async function runProAction<T>(
  status: Pick<BillingStatus, "paid">,
  feature: ProFeature,
  action: () => T | Promise<T>,
): Promise<T> {
  requirePro(status, feature);
  return await action();
}
