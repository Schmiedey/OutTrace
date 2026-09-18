import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { getOverviewStats, listRecentScans } from "@/src/storage/scans";
import { unreadWatchedAlertCount } from "@/src/storage/alerts";
import { newTabEnabled } from "@/src/storage/settings";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import "@/src/styles/globals.css";

type NewTabSummary = {
  stats: Awaited<ReturnType<typeof getOverviewStats>>;
  latest: Awaited<ReturnType<typeof listRecentScans>>[number] | undefined;
  watchedAlerts: number;
};

async function loadSummary(): Promise<NewTabSummary> {
  const [stats, scans, watchedAlerts] = await Promise.all([
    getOverviewStats(),
    listRecentScans(1),
    unreadWatchedAlertCount(),
  ]);
  return { stats, latest: scans[0], watchedAlerts };
}

function NewTabApp() {
  const enabled = useAsync(newTabEnabled, []);
  const summary = useAsync(
    async () => (enabled.data ? await loadSummary() : null),
    [enabled.data],
  );

  useEffect(() => {
    if (enabled.data !== false) return;
    // chrome://newtab is the browser-owned destination. If Chrome blocks a
    // programmatic redirect, the small fallback below still gives the user a
    // direct link and keeps the widget disabled.
    try {
      window.location.replace("chrome://newtab/");
    } catch {
      // The fallback link remains available.
    }
  }, [enabled.data]);

  if (enabled.data === false) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <p className="text-[13px] text-mute">Your normal new-tab page is unchanged. <a className="underline" href="chrome://newtab/">Open it</a>.</p>
      </main>
    );
  }
  if (!enabled.data || summary.loading) return null;
  if (summary.error || !summary.data) {
    return <main className="mx-auto flex min-h-screen max-w-2xl items-center px-8"><p className="text-[13px] text-mute">Your local LinkScope summary is unavailable right now.</p></main>;
  }

  const { latest, stats, watchedAlerts } = summary.data;
  const dashboardUrl = browser.runtime.getURL("/app.html#/");
  return (
    <main className="min-h-screen bg-canvas px-8 py-10 text-ink sm:px-14 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between gap-6 border-b border-line pb-5">
          <p className="text-[11px] font-medium tracking-[0.16em] uppercase">LinkScope</p>
          <a href={dashboardUrl} className="text-[12px] text-mute underline hover:text-ink">Open dashboard</a>
        </header>
        <section className="mt-16 max-w-2xl">
          <p className="text-[11px] tracking-[0.14em] text-mute uppercase">Your local map</p>
          <h1 className="font-display mt-3 text-5xl leading-[1.02] sm:text-6xl">Start with a clearer page.</h1>
          <p className="mt-5 text-[14px] text-mute">{latest ? `Last checked ${latest.domain} ${formatRelativeTime(latest.timestamp, Date.now())}.` : "Check a page to start building your local map."}</p>
        </section>
        <section className="mt-14 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          <Stat label="This month" value={`${formatCount(stats.trackersSpottedThisMonth)} trackers`} />
          <Stat label="Sites checked" value={formatCount(stats.sitesThisMonth)} />
          <Stat label="Watched alerts" value={formatCount(watchedAlerts)} />
        </section>
        {latest ? <p className="mt-5 text-[12px] text-mute">Latest result: {formatCount(latest.trackerCount)} tracker{latest.trackerCount === 1 ? "" : "s"} across {formatCount(latest.thirdPartyCount)} third-party domain{latest.thirdPartyCount === 1 ? "" : "s"}.</p> : null}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-canvas px-5 py-5"><p className="text-[11px] text-mute">{label}</p><p className="font-display mt-2 text-2xl">{value}</p></div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NewTabApp />
  </React.StrictMode>,
);
