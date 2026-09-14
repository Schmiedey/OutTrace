import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { groupSnapshotByOwner } from "@/src/analysis/owners";
import { countsSentence, nutritionFromScan } from "@/src/analysis/nutrition";
import { AuditSiteCard } from "@/src/components/AuditSiteCard";
import { NutritionLabel } from "@/src/components/NutritionLabel";
import { OwnerGroups } from "@/src/components/OwnerGroups";
import { ScanTimeline } from "@/src/components/ScanTimeline";
import { Badge } from "@/src/components/ui/badge";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getScanGraph, getSite, listScansForSite } from "@/src/storage/scans";

export function SiteDetailPage() {
  const params = useParams();
  const siteId = Number(params.siteId);
  const site = useAsync(() => getSite(siteId), [siteId]);
  const scans = useAsync(() => listScansForSite(siteId), [siteId]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const now = Date.now();

  const ordered = [...(scans.data ?? [])].sort((a, b) => b.timestamp - a.timestamp);
  const latest = ordered[0];
  const latestGraph = useAsync(() => (latest?.id !== undefined ? getScanGraph(latest.id) : Promise.resolve(undefined)), [
    latest?.id,
  ]);
  const nutrition = latest ? nutritionFromScan(latest, latestGraph.data) : null;
  const owners = latestGraph.data ? groupSnapshotByOwner(latestGraph.data) : [];
  const defaults = useMemo(() => {
    if (ordered.length < 2) return { from: null, to: null };
    return { from: ordered[1]?.id ?? null, to: ordered[0]?.id ?? null };
  }, [ordered]);

  const from = fromId ?? defaults.from;
  const to = toId ?? defaults.to;
  const canCompare = from !== null && to !== null && from !== to;

  if (!Number.isFinite(siteId)) {
    return <p className="px-10 py-10 text-mute">Invalid site.</p>;
  }

  return (
    <div className="px-10 py-10">
      <Link to="/sites" className="text-[13px] text-mute hover:text-ink">
        Sites
      </Link>
      <h1 className="font-display mt-2 text-4xl">{site.data?.domain ?? "Site"}</h1>
      <p className="mt-2 max-w-xl text-[14px] text-mute">
        Every scan is a frozen receipt. Pick two to see what appeared or disappeared.
      </p>
      <div className="mt-8 max-w-3xl">
        <AuditSiteCard />
      </div>

      {nutrition ? (
        <section className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <NutritionLabel nutrition={nutrition} compact />
          </div>
          <div>
            <p className="text-[18px] text-ink">{countsSentence(nutrition.counts)}</p>
            {latest?.id !== undefined ? (
              <Link
                to={`/graph/${String(latest.id)}`}
                className="mt-5 inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-[13px] font-medium text-canvas hover:bg-ink/90"
              >
                Inspect graph
              </Link>
            ) : null}
            <div className="mt-5">
              <ScanTimeline scans={ordered} />
            </div>
          </div>
        </section>
      ) : null}

      {owners.length > 0 ? (
        <section className="mt-12 max-w-2xl">
          <h2 className="font-display text-2xl">Who receives data</h2>
          <p className="mt-1 mb-4 text-[13px] text-mute">
            Third-party domains grouped by Disconnect owner from the latest scan.
          </p>
          <OwnerGroups groups={owners} />
        </section>
      ) : null}

      {ordered.length < 2 ? (
        <p className="mt-10 text-[14px] text-mute">Scan this site again to compare snapshots.</p>
      ) : (
        <div className="mt-10 flex flex-wrap items-center gap-3">
          {canCompare ? (
            <Link
              to={`/diff/${String(from)}/${String(to)}`}
              className="inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-[13px] font-medium text-canvas hover:bg-ink/90"
            >
              Compare scans
            </Link>
          ) : (
            <span className="text-[13px] text-mute">Pick two different scans.</span>
          )}
          <span className="text-[12px] text-mute">Older scan on the left, newer on the right.</span>
        </div>
      )}

      <table className="mt-8 w-full text-left text-[13px]">
        <thead className="text-[12px] text-mute">
          <tr>
            <th className="pb-2 font-normal">From</th>
            <th className="pb-2 font-normal">To</th>
            <th className="pb-2 font-normal">When</th>
            <th className="pb-2 font-normal">Third parties</th>
            <th className="pb-2 font-normal">Trackers</th>
            <th className="pb-2 font-normal">Capture</th>
            <th className="pb-2 font-normal" />
          </tr>
        </thead>
        <tbody>
          {ordered.map((scan) => {
            return (
              <tr key={scan.id} className="border-t border-line">
                <td className="py-3">
                  <input
                    type="radio"
                    name="from"
                    checked={from === scan.id}
                    onChange={() => setFromId(scan.id ?? null)}
                    aria-label={`Compare from ${scan.url}`}
                  />
                </td>
                <td className="py-3">
                  <input
                    type="radio"
                    name="to"
                    checked={to === scan.id}
                    onChange={() => setToId(scan.id ?? null)}
                    aria-label={`Compare to ${scan.url}`}
                  />
                </td>
                <td className="py-3 text-mute">{formatRelativeTime(scan.timestamp, now)}</td>
                <td className="py-3">{formatCount(scan.thirdPartyCount)}</td>
                <td className="py-3">{formatCount(scan.trackerCount)}</td>
                <td className="py-3">
                  <Badge>{scan.captureMode === "watch" ? "Watch" : scan.captureMode === "scheduled" ? "Scheduled" : "Snapshot"}</Badge>
                </td>
                <td className="py-3 text-right">
                  {scan.id !== undefined ? (
                    <Link to={`/graph/${String(scan.id)}`} className="text-ink hover:underline">
                      Graph
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
