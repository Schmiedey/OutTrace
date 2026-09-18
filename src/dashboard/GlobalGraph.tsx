import { useMemo, useState } from "react";
import { GraphViewer } from "@/src/graph/GraphViewer";
import { useGraphStore } from "@/src/graph/useGraphStore";
import { useAsync } from "@/src/lib/useAsync";
import { getGlobalSnapshot } from "@/src/storage/scans";
import { CONNECTION_TYPES, type ConnectionType } from "@/src/types/graph";

export function GlobalGraphPage() {
  const [minSeenOn, setMinSeenOn] = useState(1);
  const enabledTypes = useGraphStore((state) => state.enabledTypes);

  const types = useMemo(() => {
    const selected = CONNECTION_TYPES.filter((type) => enabledTypes[type]);
    return selected.length === CONNECTION_TYPES.length ? "all" : selected;
  }, [enabledTypes]);

  const snapshot = useAsync(
    () => getGlobalSnapshot({ minSeenOn, types: types as ConnectionType[] | "all", maxNodes: 2000 }),
    [minSeenOn, types],
  );

  if (snapshot.loading && !snapshot.data) {
    return <div className="flex h-screen items-center justify-center text-mute">Assembling global graph…</div>;
  }

  if (!snapshot.data || snapshot.data.nodes.length === 0) {
    return (
      <div className="px-8 py-8">
        <h1 className="font-display text-4xl">Global graph</h1>
        <p className="mt-3 text-mute">Scan at least one website to start the combined map.</p>
      </div>
    );
  }

  const subtitle = snapshot.data.truncated
    ? `Showing top ${String(snapshot.data.nodes.length)} of ${String(snapshot.data.totalNodes)} domains`
    : `${String(snapshot.data.nodes.length)} domains across all scans`;

  return (
    <GraphViewer
      snapshot={snapshot.data}
      title="Global graph"
      subtitle={subtitle}
      backTo="/"
      defaultLayout="tree"
      extras={
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-mute">Seen on</span>
          {[1, 2, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMinSeenOn(n)}
              className={`rounded-md px-2 py-1 text-[12px] ${
                minSeenOn === n ? "bg-ink text-canvas" : "text-mute hover:text-ink"
              }`}
            >
              {n}+ sites
            </button>
          ))}
        </div>
      }
    />
  );
}
