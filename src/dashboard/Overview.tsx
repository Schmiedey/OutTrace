import { Link } from "react-router-dom";
import { groupSnapshotByOwner, mergeOwnerGroups } from "@/src/analysis/owners";
import { insightLines } from "@/src/analysis/statistics";
import { AuditSiteCard } from "@/src/components/AuditSiteCard";
import { GettingStarted } from "@/src/components/GettingStarted";
import { ActivityInbox } from "@/src/components/ActivityInbox";
import { OwnerGroups } from "@/src/components/OwnerGroups";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getDailyBriefing, getWeeklyTrend } from "@/src/storage/briefing";
import { getOverviewStats, listLatestGraphs, listRecentScans } from "@/src/storage/scans";

export function OverviewPage() {
  const now = Date.now();
  const stats = useAsync(() => getOverviewStats(), []);
  const scans = useAsync(() => listRecentScans(12), []);
  const briefing = useAsync(() => getDailyBriefing(), []);
  const trend = useAsync(() => getWeeklyTrend(), []);
  const owners = useAsync(async () => {
    const graphs = await listLatestGraphs();
    return mergeOwnerGroups(graphs.map(groupSnapshotByOwner)).filter((group) => !group.unlisted).slice(0, 8);
  }, []);
  const densest = scans.data?.slice().sort((a, b) => b.trackerCount - a.trackerCount || b.nodeCount - a.nodeCount)[0];
  const insights = insightLines(
    stats.data ?? { sites: 0, domains: 0, connections: 0, trackers: 0 },
    densest?.domain,
    densest?.trackerCount,
  );

  return (
    <div className="px-10 py-10">
      <header className="mb-10">
        <h1 className="font-display text-4xl">Your website briefing</h1>
        {stats.data ? (
          <p className="mt-2 text-[13px] text-mute">
            You’ve scanned {formatCount(stats.data.scansThisMonth)} {stats.data.scansThisMonth === 1 ? "site" : "sites"} this month.
          </p>
        ) : null}
      </header>
      <GettingStarted />
      <ActivityInbox />
      {briefing.data ? (
        <section className="mb-8 grid gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-[1.5fr_1fr]">
          <div className="bg-canvas px-5 py-5">
            <p className="text-[11px] tracking-[0.12em] text-mute uppercase">Today</p>
            <h2 className={`font-display mt-2 text-3xl ${briefing.data.status === "attention" ? "text-rose" : briefing.data.status === "changed" ? "text-amber" : "text-ink"}`}>
              {briefing.data.headline}
            </h2>
            <p className="mt-2 text-[13px] text-mute">{briefing.data.detail}</p>
          </div>
          <div className="bg-panel px-5 py-5">
            <p className="text-[11px] tracking-[0.12em] text-mute uppercase">This week</p>
            <p className="mt-2 text-[16px] font-medium text-ink">{trend.data?.headline ?? "Building your trend…"}</p>
            <p className="mt-2 text-[12px] text-mute">
              {String(trend.data?.sitesChecked ?? 0)} {trend.data?.sitesChecked === 1 ? "site" : "sites"} checked
              {trend.data?.currentScore !== undefined ? ` · average ${String(trend.data.currentScore)}/100` : ""}
            </p>
            {trend.data ? <p className="mt-2 text-[12px] text-mute">{trend.data.changedSites} changed · {trend.data.gainedTrackers} gained trackers · {trend.data.improvedSites} improved{trend.data.scoreDelta !== undefined ? ` · score comparison: ${trend.data.comparisonSites} matching sites` : " · score comparison needs at least 3 matching sites"}</p> : null}
            {trend.data?.comparisonCurrentScore !== undefined ? <p className="mt-2 text-[12px] text-mute">Matching-site average: {trend.data.previousScore} → {trend.data.comparisonCurrentScore}</p> : null}
          </div>
        </section>
      ) : null}
      <div className="mb-8">
        <AuditSiteCard />
      </div>
      <section className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line xl:grid-cols-4">
        <StatCard label="Sites" value={stats.data?.sites} />
        <StatCard label="Domains" value={stats.data?.domains} />
        <StatCard label="Connections" value={stats.data?.connections} />
        <StatCard label="Third-party trackers" value={stats.data?.trackers} />
      </section>
      <section className="mb-10">
        <h2 className="mb-3 text-[13px] text-mute">Notes</h2>
        <ul className="space-y-1.5">
          {insights.map((line) => (
            <li key={line} className="text-[14px] text-ink">
              {line}
            </li>
          ))}
        </ul>
      </section>
      {owners.data?.length ? (
        <section className="mb-10 max-w-2xl">
          <h2 className="font-display mb-3 text-2xl">Companies across your scans</h2>
          <OwnerGroups groups={owners.data} empty="Scan a few sites to see which companies show up repeatedly." />
        </section>
      ) : null}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-2xl">Recent scans</h2>
          <Link to="/scans" className="text-[13px] text-mute hover:text-ink">
            All scans
          </Link>
        </div>
        {scans.data?.length ? (
          <div className="divide-y divide-line border-y border-line">
            {scans.data.map((scan) => {
              return (
                <Link
                  key={scan.id}
                  to={`/graph/${String(scan.id)}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-raised/80"
                >
                  <div>
                    <div className="text-[14px] text-ink">{scan.domain}</div>
                    <div className="text-[12px] text-mute">{scan.title}</div>
                  </div>
                  <div className="text-right text-[12px] text-mute">
                    <div>
                      {formatCount(scan.thirdPartyCount)} third parties · {formatCount(scan.trackerCount)} tracker
                      {scan.trackerCount === 1 ? "" : "s"}
                    </div>
                    <div>{formatRelativeTime(scan.timestamp, now)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="bg-canvas px-4 py-4">
      <div className="text-[12px] text-mute">{label}</div>
      <div className="font-display mt-1 text-3xl text-ink">{value === undefined ? "—" : formatCount(value)}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-10">
      <p className="font-display text-2xl">No scans yet</p>
      <p className="mt-2 text-[13px] text-mute">
        Open a client website and choose “Check this page” in OutTrace. Then watch it to compare future captures.
      </p>
    </div>
  );
}
