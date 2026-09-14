import { useState } from "react";
import { Link } from "react-router-dom";
import { identifyDomain } from "@/src/analysis/identity";
import type { BillingStatus } from "@/src/billing/extpay";
import { Button } from "@/src/components/ui/button";
import { formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { listSightingsForDomain } from "@/src/storage/domains";
import { listFollowedDomains, unfollowDomain } from "@/src/storage/follows";
import { normalizeWatchedSiteUrl } from "@/src/storage/watchedSites";
import type { WatchedSiteRow, WatchedSiteSchedule } from "@/src/types/graph";

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
  const [url, setUrl] = useState("");
  const [schedule, setSchedule] = useState<WatchedSiteSchedule>("daily");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const add = async (): Promise<void> => {
    setBusy("add");
    setError(null);
    try {
      const target = normalizeWatchedSiteUrl(url);
      const origin = new URL(target.url).origin;
      const origins = isPro ? ["*://*/*"] : [`${origin}/*`];
      const granted = await browser.permissions.request({ origins });
      if (!granted) throw new Error("Site access is required for the first check.");
      const response = (await browser.runtime.sendMessage({ type: "ADD_WATCHED_SITE", url: target.url, schedule })) as WatchedSitesResponse;
      if (!response.ok) throw new Error(response.error ?? "Could not add watched site.");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add watched site.");
    } finally {
      setBusy(null);
      watched.reload();
    }
  };

  const action = async (domain: string, type: "run" | "remove" | "schedule", nextSchedule?: WatchedSiteSchedule): Promise<void> => {
    setBusy(domain);
    setError(null);
    try {
      const message = type === "run"
        ? { type: "RUN_WATCHED_SITE", domain }
        : type === "schedule"
          ? { type: "UPDATE_WATCHED_SITE", domain, schedule: nextSchedule }
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

  return (
    <div className="max-w-4xl px-10 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl">Watched sites</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mute">
            LinkScope revisits these sites from this browser and alerts you when third-party domains appear or disappear.
          </p>
        </div>
        <Link to="/pro" className="text-[13px] text-ink underline">{isPro ? "Pro active" : "View Pro"}</Link>
      </div>

      <section className="mt-8 rounded-md border border-line bg-panel p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" aria-label="Website to watch" className="h-10 rounded-md border border-line bg-canvas px-3 text-[13px] outline-none focus:border-ink" />
          <select value={schedule} disabled={!isPro} onChange={(event) => setSchedule(event.target.value as WatchedSiteSchedule)} className="h-10 rounded-md border border-line bg-canvas px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-60">
            <option value="daily">Daily</option><option value="weekly">Weekly</option>
          </select>
          <Button disabled={!url.trim() || busy === "add"} onClick={() => void add()}>{busy === "add" ? "Adding & checking…" : "Add site"}</Button>
        </div>
        <p className="mt-3 text-[12px] text-mute">Free includes one manual baseline site. Pro adds scheduled checks, alerts, unlimited sites, and deep iframe scanning.</p>
      </section>

      {error ? <p className="mt-4 text-[13px] text-rose">{error}</p> : null}
      <section className="mt-8">
        {sites.length === 0 && !watched.loading ? <p className="border-y border-line py-6 text-[14px] text-mute">No watched sites yet.</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {sites.map((site) => (
              <li key={site.domain} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0"><p className="text-[15px] text-ink">{site.domain}</p><p className="mt-1 text-[12px] text-mute">{site.lastRunAt ? `Last checked ${formatRelativeTime(site.lastRunAt, now)}` : "Not checked yet"}{site.lastError ? ` · ${site.lastError}` : isPro ? ` · next ${formatNextRun(site.nextRunAt, now)}` : " · background checks · Pro"}</p></div>
                <div className="flex items-center gap-2">
                  <select value={site.schedule} disabled={!isPro || busy === site.domain} onChange={(event) => void action(site.domain, "schedule", event.target.value as WatchedSiteSchedule)} className="h-8 rounded-md border border-line bg-canvas px-2 text-[12px] disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Schedule for ${site.domain}`}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
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
