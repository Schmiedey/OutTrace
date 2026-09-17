import { Link, useParams } from "react-router-dom";
import { Badge } from "@/src/components/ui/badge";
import { diffSnapshots } from "@/src/analysis/diff";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getScan, getScanGraph } from "@/src/storage/scans";
import { CATEGORY_LABELS, type GraphNodeRecord } from "@/src/types/graph";
import { isTrackerCategory } from "@/src/analysis/categorizer";
import { useEffect } from "react";
import { classifyChange } from "@/src/analysis/changeImportance";
import { markScanActivityRead } from "@/src/storage/alerts";
import { scoreSnapshot } from "@/src/analysis/score";

export function DiffPage() {
  const params = useParams();
  const fromId = Number(params.fromId);
  const toId = Number(params.toId);
  const fromScan = useAsync(() => getScan(fromId), [fromId]);
  const toScan = useAsync(() => getScan(toId), [toId]);
  const fromGraph = useAsync(() => getScanGraph(fromId), [fromId]);
  const toGraph = useAsync(() => getScanGraph(toId), [toId]);
  const now = Date.now();
  useEffect(() => { if (toScan.data && toGraph.data && fromScan.data && fromGraph.data) void markScanActivityRead(toId).catch(() => {}); }, [toId, toScan.data?.id, fromScan.data?.id, toGraph.data?.scanId, fromGraph.data?.scanId]);

  if (![fromId, toId].every(Number.isFinite)) {
    return <p className="px-10 py-10 text-mute">Invalid comparison.</p>;
  }

  if (fromScan.loading || toScan.loading || fromGraph.loading || toGraph.loading) {
    return <p className="px-10 py-10 text-mute">Comparing snapshots…</p>;
  }

  if (!fromScan.data || !toScan.data || !fromGraph.data || !toGraph.data) {
    return (
      <div className="px-10 py-10">
        <h1 className="font-display text-3xl">Missing snapshot</h1>
        <p className="mt-2 text-mute">One of these scans is no longer stored in this browser.</p>
      </div>
    );
  }

  const diff = diffSnapshots(fromScan.data, toScan.data, fromGraph.data, toGraph.data);
  const change = classifyChange(fromScan.data, toScan.data, fromGraph.data, toGraph.data);
  const previousScore = scoreSnapshot(fromGraph.data).score;
  const nextScore = scoreSnapshot(toGraph.data).score;
  const back = `/sites/${String(toScan.data.siteId)}`;

  return (
    <div className="px-10 py-10">
      <Link to={back} className="text-[13px] text-mute hover:text-ink">
        {toScan.data.domain}
      </Link>
      <h1 className="font-display mt-2 text-4xl">What changed</h1>
      <p className="mt-2 max-w-xl text-[14px] text-mute">
        {formatRelativeTime(fromScan.data.timestamp, now)} → {formatRelativeTime(toScan.data.timestamp, now)}. First-party
        assets are included; listed trackers are marked.
      </p>
      <section className="mt-6 rounded-md border border-line bg-panel p-4"><p className="text-[12px] text-mute">{change.importance} · score {previousScore} → {nextScore}</p><ul className="mt-2 space-y-1 text-[13px]">{change.reasons.map((reason) => <li key={reason.code}>{reason.label}</li>)}</ul><p className="mt-2 text-[12px] text-mute">Only attributable privacy changes create attention. Resource churn and score movement alone do not.</p></section>
      {previousScore !== nextScore ? <details className="mt-3 text-[12px] text-mute"><summary className="cursor-pointer">Why the score changed</summary><p className="mt-2">Before: {scoreSnapshot(fromGraph.data).reasons.join(" · ")}</p><p className="mt-2">After: {scoreSnapshot(toGraph.data).reasons.join(" · ")}</p></details> : null}

      <section className="mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        <Stat label="Appeared" value={diff.added.length} />
        <Stat label="Disappeared" value={diff.removed.length} />
        <Stat label="New trackers" value={diff.addedTrackers.length} />
        <Stat label="Gone trackers" value={diff.removedTrackers.length} />
      </section>

      <div className="mt-10 grid gap-12 lg:grid-cols-2">
        <DomainList
          title="Appeared"
          empty="Nothing new."
          nodes={diff.added}
          tone="rose"
        />
        <DomainList
          title="Disappeared"
          empty="Nothing left."
          nodes={diff.removed}
          tone="mute"
        />
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Still present</h2>
        <p className="mt-1 mb-4 text-[13px] text-mute">{formatCount(diff.persistent.length)} domains in both scans.</p>
        <div className="flex flex-wrap gap-1.5">
          {diff.persistent.slice(0, 60).map((node) => (
            <Badge key={node.domain} tone={isTrackerCategory(node.category) ? "rose" : "mute"}>
              {node.domain}
            </Badge>
          ))}
          {diff.persistent.length > 60 ? (
            <Badge>+{formatCount(diff.persistent.length - 60)} more</Badge>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-canvas px-4 py-4">
      <div className="text-[12px] text-mute">{label}</div>
      <div className="font-display mt-1 text-3xl">{formatCount(value)}</div>
    </div>
  );
}

function DomainList({
  title,
  empty,
  nodes,
  tone,
}: {
  title: string;
  empty: string;
  nodes: GraphNodeRecord[];
  tone: "rose" | "mute";
}) {
  return (
    <section>
      <h2 className="font-display text-2xl">{title}</h2>
      {nodes.length === 0 ? (
        <p className="mt-3 text-[14px] text-mute">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {nodes.map((node) => (
            <li key={node.domain} className="flex items-baseline justify-between gap-4 py-3">
              <div>
                <div className={tone === "rose" ? "text-rose" : "text-mute"}>{node.domain}</div>
                <div className="text-[12px] text-mute">
                  {CATEGORY_LABELS[node.category]}
                  {node.owner ? ` · ${node.owner}` : ""}
                  {node.isFirstParty ? " · first-party" : ""}
                </div>
              </div>
              {isTrackerCategory(node.category) ? <Badge tone="rose">Tracker</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
