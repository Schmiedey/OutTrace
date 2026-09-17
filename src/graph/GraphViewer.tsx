import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { identifyDomain } from "@/src/analysis/identity";
import { enrichSnapshot } from "@/src/analysis/enrich";
import { exportGraphPng, exportScanCsv, exportScanJson } from "@/src/export/scanExport";
import { GraphCanvas } from "@/src/graph/GraphCanvas";
import { GraphToolbar } from "@/src/graph/GraphToolbar";
import { NodeInspector } from "@/src/graph/NodeInspector";
import { bestSearchMatch } from "@/src/graph/filters";
import { isTreeGroupId, nodesInTreeGroup } from "@/src/graph/treeLayout";
import type { GraphLayoutMode } from "@/src/graph/layouts";
import { useGraphStore } from "@/src/graph/useGraphStore";
import { isFollowedDomain, toggleFollowDomain } from "@/src/storage/follows";
import type { ScanGraphSnapshot, ScanRow } from "@/src/types/graph";
import { useAsync } from "@/src/lib/useAsync";
import { ShareScan } from "@/src/components/ShareScan";

export function GraphViewer({
  snapshot,
  scan,
  title,
  subtitle,
  backTo = "/",
  defaultLayout = "radial",
  extras,
  newDomains = [],
}: {
  snapshot: ScanGraphSnapshot;
  scan?: ScanRow;
  title: string;
  subtitle?: string;
  backTo?: string;
  defaultLayout?: GraphLayoutMode;
  extras?: ReactNode;
  newDomains?: string[];
}) {
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const setSearch = useGraphStore((state) => state.setSearch);
  const selectNode = useGraphStore((state) => state.selectNode);
  const hideNode = useGraphStore((state) => state.hideNode);
  const hoveredNode = useGraphStore((state) => state.hoveredNode);
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [menu, setMenu] = useState<{ domain: string; x: number; y: number; followed: boolean } | null>(null);
  const [tapTip, setTapTip] = useState<{ id: string; x: number; y: number } | null>(null);

  const graph = useMemo(() => enrichSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    const store = useGraphStore.getState();
    store.resetFilters();
    store.setLayoutMode(defaultLayout);
  }, [defaultLayout, snapshot.originDomain, snapshot.scanId]);

  const newDomainsKey = useMemo(() => newDomains.join("\0"), [newDomains]);

  useEffect(() => {
    useGraphStore.getState().setNewDomains(newDomains);
  }, [newDomains, newDomainsKey]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") return;
    const match = bestSearchMatch(graph.nodes, searchQuery);
    if (match) selectNode(match.domain);
  };

  const hover = hoveredNode ? identifyDomain(hoveredNode) : null;
  const pinnedDomain = !hoveredNode && selectedNode && !isTreeGroupId(selectedNode) ? selectedNode : null;
  const pinned = pinnedDomain ? identifyDomain(pinnedDomain) : null;
  const groupTip =
    tapTip && isTreeGroupId(tapTip.id)
      ? {
          id: tapTip.id,
          label: tapTip.id.replace("tree-group:", ""),
          nodes: nodesInTreeGroup(tapTip.id, graph.originDomain, graph.nodes),
        }
      : null;
  const tapDomainTip =
    tapTip && !isTreeGroupId(tapTip.id) ? identifyDomain(tapTip.id) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-4 border-b border-line px-6 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-[22px] leading-none text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-[12px] text-mute">{subtitle}</p> : null}
        </div>
        <label className="flex min-w-[200px] flex-1 items-center md:max-w-xs">
          <span className="sr-only">Search domains</span>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search  ⌘F"
            className="h-8 w-full rounded-md border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-mute/80 focus:border-ink/40"
          />
        </label>
        <div className="flex items-center gap-3 text-[13px]">
          <>
            <button type="button" className="text-mute hover:text-ink" onClick={() => exportScanJson(scan, graph)}>JSON</button>
            <button type="button" className="text-mute hover:text-ink" onClick={() => exportScanCsv(graph)}>CSV</button>
            <button type="button" className="text-mute hover:text-ink" onClick={() => exportGraphPng(useGraphStore.getState().cy, graph.originDomain)}>PNG</button>
            <button type="button" className="text-mute hover:text-ink" onClick={() => window.print()}>PDF</button>
          </>
          {scan ? <ShareScan scan={scan} snapshot={graph} /> : null}
          <Link to={backTo.replace(/^#/, "")} className="text-mute hover:text-ink">
            Dashboard
          </Link>
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas"
          onClick={() => {
            setMenu(null);
            setTapTip(null);
          }}
        >
          <GraphCanvas
            snapshot={graph}
            onExplore={(domain) => navigate(`/domains/${encodeURIComponent(domain)}`)}
            onContextMenu={(domain, x, y) => {
              void isFollowedDomain(domain).then((followed) => setMenu({ domain, x, y, followed }));
            }}
            onNodeTap={(id, x, y) => {
              setMenu(null);
              setTapTip({ id, x, y });
            }}
          />
          {hover ? (
            <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-xs rounded-md border border-line bg-canvas/95 px-3 py-2 shadow-sm">
              <p className="text-[13px] text-ink">{hover.name}</p>
              <p className="text-[12px] text-mute">
                {hover.domain} · {hover.typeLabel}
                {hover.owner ? ` · ${hover.owner}` : ""}
              </p>
            </div>
          ) : null}
          {pinned && tapTip && !isTreeGroupId(tapTip.id) ? (
            <GraphNodeTip
              identity={pinned}
              x={tapTip.x}
              y={tapTip.y}
              onOpen={() => selectNode(pinned.domain)}
            />
          ) : null}
          {groupTip && tapTip ? (
            <TreeGroupTip
              label={groupTip.label}
              nodes={groupTip.nodes}
              x={tapTip.x}
              y={tapTip.y}
              onSelect={(domain) => {
                selectNode(domain);
                setTapTip({ id: domain, x: tapTip.x, y: tapTip.y });
              }}
            />
          ) : null}
          {tapDomainTip && tapTip && !hover && !pinned && !groupTip ? (
            <GraphNodeTip identity={tapDomainTip} x={tapTip.x} y={tapTip.y} onOpen={() => selectNode(tapDomainTip.domain)} />
          ) : null}
          {menu ? (
            <div
              className="absolute z-20 min-w-[160px] rounded-md border border-line bg-canvas py-1 shadow-md"
              style={{ left: menu.x, top: menu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-raised"
                onClick={() => {
                  selectNode(menu.domain);
                  setMenu(null);
                }}
              >
                Inspect
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-raised"
                onClick={() => {
                  navigate(`/domains/${encodeURIComponent(menu.domain)}`);
                  setMenu(null);
                }}
              >
                Explore domain
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-raised"
                onClick={() => {
                  hideNode(menu.domain);
                  setMenu(null);
                }}
              >
                Hide
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-raised"
                onClick={() => {
                  void toggleFollowDomain(menu.domain);
                  setMenu(null);
                }}
              >
                {menu.followed ? "Stop watching" : "Watch this domain"}
              </button>
              {menu.followed ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-raised"
                  onClick={() => {
                    navigate("/following");
                    setMenu(null);
                  }}
                >
                  Open watched list
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <NodeInspector snapshot={graph} />
      </div>
      <GraphToolbar extras={extras} />
    </div>
  );
}

function tipPosition(x: number, y: number): { left: number; top: number } {
  const width = 280;
  const left = Math.max(12, Math.min(x + 12, window.innerWidth - width - 24));
  const top = Math.max(12, Math.min(y + 12, window.innerHeight - 180));
  return { left, top };
}

function GraphNodeTip({
  identity,
  x,
  y,
  onOpen,
}: {
  identity: ReturnType<typeof identifyDomain>;
  x: number;
  y: number;
  onOpen: () => void;
}) {
  const pos = tipPosition(x, y);
  return (
    <div
      className="absolute z-20 max-w-[280px] rounded-md border border-line bg-canvas px-3 py-2 shadow-md"
      style={pos}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-[13px] font-medium text-ink">{identity.name}</p>
      <p className="mt-0.5 text-[12px] text-mute">
        {identity.domain} · {identity.typeLabel}
        {identity.owner ? ` · ${identity.owner}` : ""}
      </p>
      <button type="button" className="mt-2 text-[12px] text-mute hover:text-ink" onClick={onOpen}>
        Inspect in panel
      </button>
    </div>
  );
}

function TreeGroupTip({
  label,
  nodes,
  x,
  y,
  onSelect,
}: {
  label: string;
  nodes: ScanGraphSnapshot["nodes"];
  x: number;
  y: number;
  onSelect: (domain: string) => void;
}) {
  const pos = tipPosition(x, y);
  return (
    <div
      className="absolute z-20 max-w-[280px] rounded-md border border-line bg-canvas px-3 py-2 shadow-md"
      style={pos}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-[13px] font-medium capitalize text-ink">{label.replace(/-/g, " ")}</p>
      <p className="mt-0.5 text-[12px] text-mute">{String(nodes.length)} domains</p>
      <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
        {nodes.slice(0, 8).map((node) => (
          <li key={node.domain}>
            <button
              type="button"
              className="text-left text-[12px] text-ink hover:underline"
              onClick={() => onSelect(node.domain)}
            >
              {node.domain}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
