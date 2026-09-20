import type { BillingStatus } from "@/src/billing/extpay";
import type { WatchedSiteRow } from "@/src/types/graph";

export const FREE_WATCHED_SITE_LIMIT = 2;
export const FREE_AUDIT_LIMIT_MESSAGE = "Free includes one site audit per day. Upgrade to Pro for unlimited audits.";

export type ProFeature =
  | "deep-scan"
  | "deep-audit"
  | "unlimited-audits"
  | "scheduled-checks"
  | "unlimited-watched-sites"
  | "export";

const PRO_MESSAGES: Record<ProFeature, string> = {
  "deep-scan": "Single-page scans are free.",
  "deep-audit": "Deep audits require LinkScope Pro.",
  "unlimited-audits": FREE_AUDIT_LIMIT_MESSAGE,
  "scheduled-checks": "Scheduled background checks require LinkScope Pro.",
  "unlimited-watched-sites": "Free includes two watched sites. Upgrade to Pro for unlimited sites.",
  export: "Export requires LinkScope Pro.",
};

export function requirePro(status: Pick<BillingStatus, "paid">, feature: ProFeature): void {
  if (feature === "deep-scan") return;
  if (!status.paid) throw new Error(PRO_MESSAGES[feature]);
}

/** Free users can keep two explicitly watched sites; Pro removes that limit. */
export function requireWatchlistCapacity(
  status: Pick<BillingStatus, "paid">,
  sites: Pick<WatchedSiteRow, "domain">[],
  domain: string,
): void {
  if (status.paid || sites.some((site) => site.domain === domain)) return;
  if (sites.length < FREE_WATCHED_SITE_LIMIT) return;
  throw new Error(PRO_MESSAGES["unlimited-watched-sites"]);
}

export async function runProAction<T>(
  status: Pick<BillingStatus, "paid">,
  feature: ProFeature,
  action: () => T | Promise<T>,
): Promise<T> {
  requirePro(status, feature);
  return await action();
}
