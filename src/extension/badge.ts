import { canScanUrl } from "@/src/extension/permissions";
import { registrableDomain } from "@/src/lib/domain";
import { formatRelativeTime } from "@/src/lib/utils";
import { db } from "@/src/storage/database";
import { getSiteGlance } from "@/src/storage/glance";
import { scoreSnapshot, scoreFromScan } from "@/src/analysis/score";
import { activityImportance } from "@/src/analysis/changeImportance";
import type { AlertRow, ScanGraphSnapshot, ScanRow } from "@/src/types/graph";

export type BadgeHint = { text: string; color: string; title?: string };
export { activityImportance };
export function badgeForGlance(input: {
  latest: ScanRow;
  previous?: ScanRow;
  latestGraph?: ScanGraphSnapshot;
  previousGraph?: ScanGraphSnapshot;
  activity?: AlertRow[];
}): BadgeHint {
  const graphScore = input.latestGraph ? scoreSnapshot(input.latestGraph) : null;
  const score = graphScore ?? scoreFromScan(input.latest);
  const activity = (input.activity ?? []).filter(
    (alert) => !alert.read && activityImportance(alert) !== "routine",
  );
  const important = activity.some(
    (alert) => activityImportance(alert) === "important",
  );
  const summary = activity
    .slice(0, 3)
    .map(
      (alert) =>
        `${alert.siteDomain}: ${
          alert.reasons
            ?.filter((reason) => reason.importance !== "routine")
            .slice(0, 2)
            .map((reason) => reason.label)
            .join("; ") || `${alert.addedTrackers.length} new trackers`
        }`,
    )
    .join(" · ");
  return {
    text: important
      ? "!"
      : activity.length
        ? `+${activity.length > 9 ? "9+" : activity.length}`
        : "",
    color: important ? "#b91c1c" : "#a16207",
    title: `LinkScope — ${activity.length ? `${summary} · ` : ""}Score ${score.score} · ${graphScore?.trackers ?? input.latest.trackerCount} trackers · checked ${formatRelativeTime(input.latest.timestamp, Date.now())} (saved capture)`,
  };
}

const revisions = new Map<number, number>();
let sequence = 0;
export async function applyActionState({
  tabId,
  url,
}: {
  tabId: number;
  url?: string;
}): Promise<void> {
  if (typeof browser === "undefined" || !browser.action?.setBadgeText) return;
  const revision = ++sequence;
  revisions.set(tabId, revision);
  let hint: BadgeHint = {
    text: "",
    color: "#a16207",
    title: "LinkScope — click to check this page. No saved capture yet.",
  };
  if (url && canScanUrl(url)) {
    const domain = registrableDomain(url) ?? new URL(url).hostname;
    const [glance, alerts] = await Promise.all([
      getSiteGlance(domain),
      db.alerts.toArray(),
    ]);
    if (glance) hint = badgeForGlance({ ...glance, activity: alerts });
  }
  if (revisions.get(tabId) !== revision) return;
  await Promise.all([
    browser.action.setBadgeText({ tabId, text: hint.text }),
    browser.action.setTitle?.({ tabId, title: hint.title ?? "LinkScope" }),
    browser.action.setBadgeBackgroundColor?.({ tabId, color: hint.color }),
  ]);
}
export function forgetActionState(tabId: number): void {
  revisions.delete(tabId);
}
export async function applyBadgeForUrl(
  url: string | undefined,
  tabId?: number,
): Promise<void> {
  if (tabId !== undefined) await applyActionState({ tabId, url });
  else await refreshActiveTabBadge();
}
export async function refreshActiveTabBadge(): Promise<void> {
  if (typeof browser === "undefined" || !browser.tabs?.query) return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined)
    await applyActionState({ tabId: tab.id, url: tab.url });
}

/** A visit-only watch alert is deliberately local to the tab that caused it. */
export async function setWatchlistBadge(tabId: number, newDomains: number): Promise<void> {
  if (!browser.action?.setBadgeText || newDomains <= 0) return;
  await Promise.all([
    browser.action.setBadgeText({ tabId, text: String(newDomains) }),
    browser.action.setBadgeBackgroundColor?.({ tabId, color: "#a16207" }),
    browser.action.setTitle?.({ tabId, title: `LinkScope — ${String(newDomains)} new ${newDomains === 1 ? "domain" : "domains"} on this watched site` }),
  ]);
}
