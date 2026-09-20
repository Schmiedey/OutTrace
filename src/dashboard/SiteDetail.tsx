import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { groupSnapshotByOwner } from "@/src/analysis/owners";
import { nutritionFromScan } from "@/src/analysis/nutrition";
import { scoreVerdict } from "@/src/analysis/score";
import { OwnerGroups } from "@/src/components/OwnerGroups";
import { ScanTimeline } from "@/src/components/ScanTimeline";
import { Badge } from "@/src/components/ui/badge";
import { SiteWatching } from "@/src/components/SiteWatching";
import { getSiteMemory } from "@/src/storage/siteMemory";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getScanGraph, getSite, listScansForSite } from "@/src/storage/scans";

const gradeStyle = {
  A: "border-lime/30 bg-lime/10 text-lime",
  B: "border-line bg-raised text-ink",
  C: "border-amber/30 bg-amber/10 text-amber",
  D: "border-amber/30 bg-amber/10 text-amber",
  F: "border-rose/30 bg-rose/10 text-rose",
} as const;

export function SiteDetailPage() {
  const params = useParams();
  const siteId = Number(params.siteId);
  const site = useAsync(() => getSite(siteId), [siteId]);
  const scans = useAsync(() => listScansForSite(siteId), [siteId]);
  const memory = useAsync(() => getSiteMemory(siteId), [siteId]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const now = Date.now();

  const ordered = [...(scans.data ?? [])].sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  const latest = ordered[0];
  const latestGraph = useAsync(
    () =>
      latest?.id !== undefined
        ? getScanGraph(latest.id)
        : Promise.resolve(undefined),
    [latest?.id],
  );
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

  const scoreDescription = nutrition
    ? scoreVerdict({
        score: nutrition.privacyScore,
        trackers: nutrition.counts.trackers,
        unknown: nutrition.counts.unknown,
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <header>
        <Link to="/sites" className="text-[13px] text-mute hover:text-ink">
          Sites
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
              Site report
            </p>
            <h1 className="font-display mt-1 text-4xl">
              {site.data?.domain ?? "Site"}
            </h1>
          </div>
          {latest ? (
            <p className="text-[13px] text-mute">
              Latest capture · {formatRelativeTime(latest.timestamp, now)}
            </p>
          ) : null}
        </div>
      </header>

      {nutrition && latest ? (
        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="overflow-hidden rounded-md border border-line bg-panel">
            <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="max-w-xl">
                <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
                  Latest privacy grade
                </p>
                <h2 className="font-display mt-2 text-3xl">
                  {scoreDescription}
                </h2>
                <p className="mt-2 text-[13px] text-mute">
                  Based on the resources in this saved page capture. Unknown
                  domains are shown but do not lower the score.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {latest.id !== undefined ? <Link to={`/reports/${latest.id}`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13px] font-medium">Client report</Link> : null}
                  {latest.id !== undefined ? (
                    <Link
                      to={`/graph/${String(latest.id)}`}
                      className="inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-[13px] font-medium text-canvas hover:bg-ink/90"
                    >
                      Inspect connections
                    </Link>
                  ) : null}
                  <Link
                    to={`/audits/new?url=${encodeURIComponent(latest.url)}`}
                    className="inline-flex h-9 items-center rounded-md border border-line bg-canvas px-3.5 text-[13px] font-medium text-ink hover:bg-raised"
                  >
                    Audit this site
                  </Link>
                  <span className="inline-flex h-9 items-center text-[12px] text-mute">
                    {latest.captureMode === "watch"
                      ? "Watched capture"
                      : "One-page capture"}
                  </span>
                </div>
              </div>
              <div
                className={`flex h-36 w-36 shrink-0 flex-col items-center justify-center rounded-md border ${gradeStyle[nutrition.privacy]}`}
                aria-label={`Privacy grade ${nutrition.privacy}, score ${nutrition.privacyScore} out of 100`}
              >
                <span className="font-display text-6xl leading-none">
                  {nutrition.privacy}
                </span>
                <span className="mt-1 text-[12px] font-medium">
                  {nutrition.privacyScore}/100
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
              <Metric
                label="Third parties"
                value={nutrition.counts.thirdParties}
              />
              <Metric
                label="Trackers"
                value={nutrition.counts.trackers}
                tone={nutrition.counts.trackers > 0 ? "rose" : undefined}
              />
              <Metric label="Ads" value={nutrition.counts.ads} />
              <Metric label="Unknown" value={nutrition.counts.unknown} />
            </dl>
          </div>

          <aside>
            {site.data ? (
              <SiteWatching
                domain={site.data.domain}
                url={latest.url}
                className="mt-0"
              />
            ) : null}
            {memory.data && memory.data.scanCount >= 3 ? (
              <section className="mt-4 rounded-md border border-line bg-panel p-4 text-[12px] text-mute">
                <h2 className="font-medium text-ink">Local site baseline</h2>
                <p className="mt-2">
                  {memory.data.scanCount} saved captures · typical score{" "}
                  {memory.data.typicalScore}/100 · typically{" "}
                  {memory.data.typicalTrackerCount} trackers.
                </p>
                <p className="mt-2">
                  Usual owners:{" "}
                  {memory.data.normalOwners.join(", ") || "not yet identified"}.
                </p>
              </section>
            ) : null}
          </aside>
        </section>
      ) : (
        <p className="mt-8 text-[14px] text-mute">
          No saved scan is available for this site yet.
        </p>
      )}

      {owners.length > 0 ? (
        <section className="mt-10 max-w-3xl">
          <h2 className="font-display text-2xl">Who receives data</h2>
          <p className="mt-1 mb-4 text-[13px] text-mute">
            Third-party domains grouped by identified owner from the latest
            capture.
          </p>
          <OwnerGroups groups={owners} />
        </section>
      ) : null}

      <section className="mt-10 rounded-md border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
              Capture history
            </p>
            <h2 className="font-display mt-1 text-2xl">Compare saved scans</h2>
            <p className="mt-1 text-[13px] text-mute">
              Choose an older and newer capture to see what changed.
            </p>
          </div>
          {ordered.length >= 2 && canCompare ? (
            <Link
              to={`/diff/${String(from)}/${String(to)}`}
              className="inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-[13px] font-medium text-canvas hover:bg-ink/90"
            >
              Compare scans
            </Link>
          ) : null}
        </div>

        {ordered.length >= 2 ? (
          <div className="mt-5">
            <ScanTimeline scans={ordered} />
          </div>
        ) : (
          <p className="mt-5 text-[13px] text-mute">
            Scan this site again to unlock a comparison.
          </p>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[670px] text-left text-[13px]">
            <thead className="text-[12px] text-mute">
              <tr>
                <th className="pb-2 font-normal">From</th>
                <th className="pb-2 font-normal">To</th>
                <th className="pb-2 font-normal">When</th>
                <th className="pb-2 font-normal">Grade</th>
                <th className="pb-2 font-normal">Third parties</th>
                <th className="pb-2 font-normal">Trackers</th>
                <th className="pb-2 font-normal">Capture</th>
                <th className="pb-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((scan) => {
                const scanNutrition = nutritionFromScan(scan);
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
                    <td className="py-3 text-mute">
                      {formatRelativeTime(scan.timestamp, now)}
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={
                          scanNutrition.privacy === "F"
                            ? "rose"
                            : scanNutrition.privacy === "C" ||
                                scanNutrition.privacy === "D"
                              ? "amber"
                              : scanNutrition.privacy === "A"
                                ? "lime"
                                : "mute"
                        }
                      >
                        {scanNutrition.privacy} · {scanNutrition.privacyScore}
                      </Badge>
                    </td>
                    <td className="py-3">
                      {formatCount(scan.thirdPartyCount)}
                    </td>
                    <td className="py-3">{formatCount(scan.trackerCount)}</td>
                    <td className="py-3">
                      <Badge>
                        {scan.captureMode === "watch"
                          ? "Watch"
                          : scan.captureMode === "scheduled"
                            ? "Scheduled"
                            : "Snapshot"}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      {scan.id !== undefined ? (
                        <Link
                          to={`/graph/${String(scan.id)}`}
                          className="text-ink hover:underline"
                        >
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
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "rose";
}) {
  return (
    <div className="bg-panel px-4 py-4">
      <dt className="text-[12px] text-mute">{label}</dt>
      <dd
        className={`font-display mt-1 text-3xl ${tone === "rose" ? "text-rose" : "text-ink"}`}
      >
        {formatCount(value)}
      </dd>
    </div>
  );
}
