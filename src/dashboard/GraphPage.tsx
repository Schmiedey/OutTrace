import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { enrichSnapshot, thirdPartyCountOf, trackerCountOf } from "@/src/analysis/enrich";
import { GraphViewer } from "@/src/graph/GraphViewer";
import { formatCount } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getScan, getScanGraph, listScansForSite } from "@/src/storage/scans";

export function GraphPage() {
  const params = useParams();
  const scanId = Number(params.scanId);
  const scan = useAsync(() => getScan(scanId), [scanId]);
  const graph = useAsync(() => getScanGraph(scanId), [scanId]);
  const previousGraph = useAsync(async () => {
    const current = await getScan(scanId);
    if (!current) return undefined;
    const scans = [...(await listScansForSite(current.siteId))].sort((a, b) => b.timestamp - a.timestamp);
    const prev = scans.find((item) => item.id !== current.id);
    if (prev?.id === undefined) return undefined;
    return await getScanGraph(prev.id);
  }, [scanId]);

  const newDomains = useMemo(() => {
    if (!graph.data || !previousGraph.data) return [];
    const prevIds = new Set(
      enrichSnapshot(previousGraph.data)
        .nodes.filter((node) => !node.isOrigin)
        .map((node) => node.domain),
    );
    return enrichSnapshot(graph.data)
      .nodes.filter((node) => !node.isOrigin && !prevIds.has(node.domain))
      .map((node) => node.domain);
  }, [graph.data, previousGraph.data]);

  if (!Number.isFinite(scanId)) {
    return <p className="p-8 text-mute">Invalid scan.</p>;
  }

  if (graph.loading || scan.loading) {
    return <div className="flex h-screen items-center justify-center text-mute">Rendering graph…</div>;
  }

  if (!graph.data || !scan.data) {
    return (
      <div className="p-8">
        <h1 className="font-display text-3xl">Scan not found</h1>
        <p className="mt-2 text-mute">This snapshot is no longer in local storage.</p>
      </div>
    );
  }

  const snapshot = graph.data;
  const captureNote = scan.data.captureMode === "watch" ? " · 15s watch" : scan.data.captureMode === "scheduled" ? " · scheduled check" : "";

  return (
    <GraphViewer
      snapshot={snapshot}
      scan={scan.data}
      title={scan.data.domain}
      subtitle={`${formatCount(thirdPartyCountOf(snapshot))} third parties · ${formatCount(trackerCountOf(snapshot))} trackers${captureNote}`}
      backTo={`/sites/${String(scan.data.siteId)}`}
      newDomains={newDomains}
    />
  );
}
