import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { identifyDomain } from "@/src/analysis/identity";
import type { BillingStatus } from "@/src/billing/extpay";
import { Button } from "@/src/components/ui/button";
import { formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { listSightingsForDomain } from "@/src/storage/domains";
import { listFollowedDomains, unfollowDomain } from "@/src/storage/follows";
import { normalizeWatchedSiteUrl } from "@/src/storage/watchedSites";
import type { WatchedSiteRow, WatchedSiteSchedule } from "@/src/types/graph";
import { requestWatchlistPermission } from "@/src/extension/watchlistPermission";
import { FREE_WATCHED_SITE_LIMIT } from "@/src/billing/entitlements";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";
import { noteUsage } from "@/src/telemetry/usage";
import { recordUpgradeFriction } from "@/src/storage/settings";

type WatchedSitesResponse = {
  ok?: boolean;
  sites?: WatchedSiteRow[];
  billing?: BillingStatus;
  error?: string;
};

async function loadWatchedSites(): Promise<{ sites: WatchedSiteRow[]; billing: BillingStatus }> {
  const response = (await browser.runtime.sendMessage({ type: "LIST_WATCHED_SITES" })) as WatchedSitesResponse;
  if (!response.ok || !response.sites || !response.billing) {
    throw new Error(response.error ?? "Could not load watched sites.");
  }
  return { sites: response.sites, billing: response.billing };
}

function formatNextRun(timestamp: number, now: number): string {
  const remaining = timestamp - now;
  if (remaining <= 60_000) return "due now";
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours < 48) return `in ${String(hours)}h`;
  return `in ${String(Math.ceil(hours / 24))}d`;
}

export function FollowingPage() {
  const watched = useAsync(loadWatchedSites, []);
  const followed = useAsync(() => listFollowedDomains(), []);
  const [params] = useSearchParams();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [schedule, setSchedule] = useState<WatchedSiteSchedule>("visit");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openUpgrade = useUpgradePrompt();
  const now = Date.now();

  const add = async (): Promise<void> => {
    if (!canAddSite) {
      noteUsage("watch-limit-locked-clicked");
      noteUsage("upgrade-opened");
      void recordUpgradeFriction("watch-limit");
      openUpgrade();
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const target = normalizeWatchedSiteUrl(url);
      const granted = await requestWatchlistPermission(target.url);
      const response = (await browser.runtime.sendMessage({ type: "ADD_WATCHED_SITE", url: target.url, schedule, accessGranted: granted })) as WatchedSitesResponse;
      if (!response.ok) throw new Error(response.error ?? "Could not add watched site.");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add watched site.");
    } finally {
      setBusy(null);
      watched.reload();
    }
  };

  const action = async (domain: string, type: "run" | "remove" | "schedule" | "alert", nextSchedule?: WatchedSiteSchedule, alertMode?: "important" | "all" | "never"): Promise<void> => {
    setBusy(domain);
    setError(null);
    try {
      const message = type === "run"
        ? { type: "RUN_WATCHED_SITE", domain }
        : type === "schedule" || type === "alert"
          ? { type: "UPDATE_WATCHED_SITE", domain, schedule: nextSchedule, alertMode }
          : { type: "REMOVE_WATCHED_SITE", domain };
      const response = (await browser.runtime.sendMessage(message)) as WatchedSitesResponse;
      if (!response.ok) throw new Error(response.error ?? "Could not update watched site.");
      watched.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update watched site.");
    } finally {
      setBusy(null);
      watched.reload();
    }
  };

  const sites = watched.data?.sites ?? [];
  const isPro = watched.data?.billing.paid ?? false;
  const canAddSite = isPro || sites.length < FREE_WATCHED_SITE_LIMIT;

  return (
    <div className="max-w-4xl px-10 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl">Watched sites</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mute">
            Keep watch on client websites after deployments, plugin updates, and tag changes. Free checks two sites when you visit. Pro adds daily or weekly checks while this browser is running.
          </p>
        </div>
        <Link to="/pro" className="text-[13px] text-ink underline">{isPro ? "Pro active" : "View Pro"}</Link>
      </div>

      <p className="mt-3 text-[12px] text-mute">Adding a site asks only for that hostname, with a clear explanation. If you decline, it stays here for manual checks only. Notifications remain off unless enabled in Settings.</p>
      <section className="mt-8 rounded-md border border-line bg-panel p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" aria-label="Website to watch" className="h-10 rounded-md border border-line bg-canvas px-3 text-[13px] outline-none focus:border-ink" />
          <select value={schedule} aria-label="Check frequency" disabled={!isPro} onChange={(event) => setSchedule(event.target.value as WatchedSiteSchedule)} className="h-10 rounded-md border border-line bg-canvas px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-60">
            <option value="visit">When I visit</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
          </select>
          <Button disabled={!url.trim() || busy !== null || watched.loading || Boolean(watched.error)} onClick={() => void add()}>{busy === "add" ? "Adding & checking…" : canAddSite ? "Watch this site" : "Unlock more sites · Pro"}</Button>
        </div>
        <p className="mt-3 text-[12px] text-mute">Free includes two visit-only watched sites. Pro removes the site limit and adds daily or weekly checks, digests, and multi-site reporting. Single-page scans and badges stay free.</p>
        <p className="mt-2 text-[12px] text-mute">Every change includes routine entries in the collapsed Activity inbox. Never keeps scans in local history without inbox or badge events. Only important changes can send notifications; delivery is controlled separately in Settings.</p>
      </section>

      {error || watched.error ? <p role="alert" className="mt-4 text-[13px] text-rose">{error ?? watched.error}</p> : null}
      <section className="mt-8">
        {sites.length === 0 && !watched.loading ? <p className="border-y border-line py-6 text-[14px] text-mute">No watched sites yet.</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {sites.map((site) => (
              <li key={site.domain} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0"><p className="text-[15px] text-ink">{site.domain}{!site.enabled ? " · paused" : ""}</p><p className="mt-1 text-[12px] text-mute">{!site.accessGranted ? "Manual checks only · site access not granted" : site.lastRunAt ? `Last checked ${formatRelativeTime(site.lastRunAt, now)}` : "Not checked yet"}{site.accessGranted && (site.lastError ? ` · ${site.lastError}` : site.schedule === "visit" ? " · when you visit" : isPro ? ` · next ${formatNextRun(site.nextRunAt, now)}` : " · background checks · Pro")}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={site.schedule} disabled={!isPro || busy === site.domain} onChange={(event) => void action(site.domain, "schedule", event.target.value as WatchedSiteSchedule)} className="h-8 rounded-md border border-line bg-canvas px-2 text-[12px] disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Schedule for ${site.domain}`}><option value="visit">When I visit</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
                  <select value={site.alertMode ?? "important"} disabled={busy === site.domain} aria-label={`Activity for ${site.domain}`} className="h-8 rounded-md border border-line bg-canvas px-2 text-[12px]" onChange={(event) => void action(site.domain, "alert", undefined, event.target.value as "important" | "all" | "never")}><option value="important">Important changes</option><option value="all">Every change</option><option value="never">Never</option></select>
                  {site.lastScanId ? <Link className="text-[12px] underline" to={`/graph/${String(site.lastScanId)}`}>Latest</Link> : null}
                  <Button size="sm" variant="ghost" disabled={busy === site.domain} onClick={() => void action(site.domain, "run")}>Check now</Button>
                  <Button size="sm" variant="ghost" disabled={busy === site.domain} onClick={() => void action(site.domain, "remove")}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="font-display text-2xl">Tracked third-party domains</h2>
        <p className="mt-2 max-w-xl text-[13px] text-mute">These alerts fire when a domain appears on a page you manually check.</p>
        {(followed.data ?? []).length === 0 ? <p className="mt-5 text-[13px] text-mute">Track a domain from any scan to see it here.</p> : (
          <div className="mt-6 space-y-10">{(followed.data ?? []).map((domain) => <FollowedDomain key={domain} domain={domain} now={now} onUnfollow={() => followed.reload()} />)}</div>
        )}
      </section>
    </div>
  );
}

function FollowedDomain({ domain, now, onUnfollow }: { domain: string; now: number; onUnfollow: () => void }) {
  const identity = identifyDomain(domain);
  const sightings = useAsync(() => listSightingsForDomain(domain), [domain]);
  return <section><div className="mb-3 flex items-baseline justify-between gap-3"><div><Link to={`/domains/${encodeURIComponent(domain)}`} className="font-display text-xl hover:underline">{identity.name}</Link><p className="text-[12px] text-mute">{domain}{identity.owner ? ` · ${identity.owner}` : ""}</p></div><Button variant="ghost" size="sm" onClick={() => void unfollowDomain(domain).then(onUnfollow)}>Untrack</Button></div><ul className="divide-y divide-line border-y border-line">{(sightings.data ?? []).map((item) => <li key={`${item.siteDomain}-${String(item.id)}`} className="flex items-center justify-between py-2.5"><div><p className="text-[13px]">{item.siteDomain}</p><p className="text-[12px] text-mute">{formatRelativeTime(item.lastSeen, now)}</p></div><Link to={`/graph/${String(item.lastScanId)}`} className="text-[13px] hover:underline">View graph</Link></li>)}</ul></section>;
}
