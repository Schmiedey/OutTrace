import cytoscape, {
  type Core,
  type Css,
  type ElementDefinition,
  type LayoutOptions,
} from "cytoscape";
import fcose from "cytoscape-fcose";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { EDGE_COLORS, VIZ_CATEGORY_COLORS } from "@/src/graph/colors";
import {
  filterSnapshot,
  matchesSearch,
  neighborIds,
} from "@/src/graph/filters";
import type { GraphLayoutMode } from "@/src/graph/layouts";
import {
  buildTreeElements,
  isSyntheticTreeId,
  runTreeLayout,
  treePathIds,
  TREE_STYLESHEET,
} from "@/src/graph/treeLayout";
import { useGraphStore } from "@/src/graph/useGraphStore";
import type { ScanGraphSnapshot } from "@/src/types/graph";

cytoscape.use(fcose);

type Props = {
  snapshot: ScanGraphSnapshot;
  onExplore?: (domain: string) => void;
  onContextMenu?: (domain: string, x: number, y: number) => void;
  onNodeTap?: (id: string, x: number, y: number) => void;
};

const NODE_STYLE: Css.Node = {
  "background-color": "data(color)",
  "background-opacity": 1,
  "border-width": 1,
  "border-color": "#e5e5e5",
  width: "data(size)",
  height: "data(size)",
  label: "data(label)",
  color: "#525252",
  "font-size": 10,
  "font-family": "IBM Plex Sans, ui-sans-serif, sans-serif",
  "font-weight": 400,
  "text-outline-width": 3,
  "text-outline-color": "#ffffff",
  "text-valign": "bottom",
  "text-margin-y": 6,
  "text-wrap": "wrap",
  "text-max-width": "110px",
  "overlay-opacity": 0,
  "z-index": 10,
};

const STYLESHEET: cytoscape.StylesheetStyle[] = [
  { selector: "node", style: NODE_STYLE },
  {
    selector: "node.origin",
    style: {
      "border-width": 0,
      "text-valign": "bottom",
      "text-margin-y": 8,
      "font-size": 12,
      "font-weight": 500,
      color: "#171717",
      "text-outline-width": 3,
      "text-outline-color": "#ffffff",
      "z-index": 30,
      "text-max-width": "160px",
    },
  },
  {
    selector: "node.nolabel",
    style: { label: "" },
  },
  {
    selector: "edge",
    style: {
      width: "data(width)",
      "line-color": "data(color)",
      "target-arrow-shape": "none",
      "curve-style": "bezier",
      "control-point-step-size": 18,
      opacity: 0.45,
      "overlay-opacity": 0,
    },
  },
  {
    selector: ".faded",
    style: { opacity: 0.12 },
  },
  {
    selector: ".highlighted",
    style: { opacity: 1, "z-index": 40 },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 2,
      "border-color": "#171717",
      "z-index": 50,
    },
  },
];

function buildElements(
  snapshot: ScanGraphSnapshot,
  nodes: ScanGraphSnapshot["nodes"],
  edges: ScanGraphSnapshot["edges"],
): ElementDefinition[] {
  const origin = snapshot.originDomain;
  const nodeEls: ElementDefinition[] = nodes.map((node) => ({
    group: "nodes",
    data: {
      id: node.domain,
      label: node.domain,
      color: VIZ_CATEGORY_COLORS[node.category],
      size: node.isOrigin
        ? 36
        : Math.max(
            16,
            Math.min(28, 14 + Math.log2(node.referenceCount + 1) * 4),
          ),
      // Concentric layouts treat each numeric rank as a ring. Keep the origin
      // one ring outside its connections; a large sentinel (100) creates
      // dozens of empty rings and fits the real nodes off-screen.
      rank: node.isOrigin || node.domain === origin ? 2 : 1,
    },
    classes: node.isOrigin || node.domain === origin ? "origin" : node.category,
  }));

  const ids = new Set(nodes.map((node) => node.domain));
  const edgeEls: ElementDefinition[] = edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({
      group: "edges",
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        color: EDGE_COLORS[edge.type],
        width: Math.min(1.8, 0.7 + Math.log2(edge.count + 1) * 0.35),
      },
    }));

  return [...nodeEls, ...edgeEls];
}

function runLayout(
  cy: Core,
  mode: GraphLayoutMode,
  origin: string,
  animate: boolean,
): void {
  cy.stop();
  const shared = {
    animate,
    animationDuration: animate ? 620 : 0,
    animationEasing: "ease-out",
    fit: true,
    padding: 64,
  };

  if (mode === "tree") {
    runTreeLayout(cy, animate);
    return;
  }

  if (mode === "force") {
    cy.layout({
      name: "fcose",
      quality: animate ? "proof" : "default",
      randomize: true,
      animate: animate ? "end" : false,
      animationDuration: animate ? 720 : 0,
      nodeRepulsion: () => 7200,
      idealEdgeLength: () => 120,
      edgeElasticity: () => 0.45,
      gravity: 0.18,
      gravityRange: 3.8,
      packComponents: true,
      nodeSeparation: 90,
      fit: true,
      padding: 64,
    } as LayoutOptions).run();
    return;
  }

  cy.layout({
    name: "concentric",
    minNodeSpacing: 56,
    concentric: (node) => Number(node.data("rank") ?? 1),
    levelWidth: () => 1,
    startAngle: (3 * Math.PI) / 2,
    equidistant: false,
    ...shared,
  } as LayoutOptions).run();
}

function applyFocus(
  cy: Core,
  selected: string | null,
  actives: string[],
  showLabels: boolean,
): void {
  cy.batch(() => {
    cy.elements().removeClass("faded highlighted nolabel");
    if (!showLabels) cy.nodes().addClass("nolabel");
    if (actives.length > 0) {
      const active = new Set(actives);
      cy.elements().addClass("faded");
      for (const id of actives) {
        cy.getElementById(id).removeClass("faded").addClass("highlighted");
      }
      cy.edges().forEach((edge) => {
        if (active.has(edge.source().id()) && active.has(edge.target().id())) {
          edge.removeClass("faded").addClass("highlighted");
        }
      });
    }
    cy.nodes().unselect();
    if (selected) cy.getElementById(selected).select();
  });
}

export const GraphCanvas = memo(function GraphCanvas({
  snapshot,
  onExplore,
  onContextMenu,
  onNodeTap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onExploreRef = useRef(onExplore);
  const onContextMenuRef = useRef(onContextMenu);
  const onNodeTapRef = useRef(onNodeTap);
  onExploreRef.current = onExplore;
  onContextMenuRef.current = onContextMenu;
  onNodeTapRef.current = onNodeTap;
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const enabledTypes = useGraphStore((state) => state.enabledTypes);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const showLabels = useGraphStore((state) => state.showLabels);
  const thirdPartyOnly = useGraphStore((state) => state.thirdPartyOnly);
  const hideCommonInfra = useGraphStore((state) => state.hideCommonInfra);
  const hideFirstParty = useGraphStore((state) => state.hideFirstParty);
  const categoryLens = useGraphStore((state) => state.categoryLens);
  const hiddenDomains = useGraphStore((state) => state.hiddenDomains);
  const newDomains = useGraphStore((state) => state.newDomains);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutNonce = useGraphStore((state) => state.layoutNonce);
  const layoutRunningRef = useRef(false);

  const filtered = useMemo(
    () =>
      filterSnapshot(
        snapshot.nodes,
        snapshot.edges,
        {
          enabledTypes,
          thirdPartyOnly,
          hideCommonInfra,
          hideFirstParty,
          searchQuery,
          categoryLens,
          hiddenDomains,
          newDomains,
        },
        snapshot.originDomain,
      ),
    [
      categoryLens,
      enabledTypes,
      hiddenDomains,
      hideCommonInfra,
      hideFirstParty,
      newDomains,
      snapshot.edges,
      snapshot.nodes,
      snapshot.originDomain,
      thirdPartyOnly,
    ],
  );

  const elements = useMemo(
    () =>
      layoutMode === "tree"
        ? buildTreeElements(snapshot, filtered.nodes, filtered.edges)
        : buildElements(snapshot, filtered.nodes, filtered.edges),
    [
      filtered.edges,
      filtered.nodes,
      layoutMode,
      snapshot.originDomain,
      snapshot.scanId,
    ],
  );

  const elementsKey = useMemo(
    () =>
      [
        snapshot.scanId,
        layoutMode,
        filtered.nodes.map((node) => node.domain).join("\0"),
        filtered.edges.map((edge) => edge.id).join("\0"),
      ].join("|"),
    [filtered.edges, filtered.nodes, layoutMode, snapshot.scanId],
  );

  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const lastLayoutRequest = useRef<{
    mode: GraphLayoutMode;
    nonce: number;
    scanId: number;
  } | null>(null);

  const actives = useMemo(() => {
    if (layoutMode === "tree" && selectedNode) {
      return treePathIds(selectedNode, snapshot, filtered.nodes);
    }
    if (selectedNode) return neighborIds(selectedNode, filtered.edges);
    const query = searchQuery.trim();
    if (!query) return [];
    return filtered.nodes
      .filter((node) => matchesSearch(node, query))
      .map((node) => node.domain);
  }, [
    filtered.edges,
    filtered.nodes,
    layoutMode,
    searchQuery,
    selectedNode,
    snapshot.originDomain,
  ]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cy = cytoscape({
      container,
      elements: [],
      style: layoutMode === "tree" ? TREE_STYLESHEET : STYLESHEET,
      minZoom: 0.18,
      maxZoom: 3.6,
      boxSelectionEnabled: false,
      pixelRatio: "auto",
    });
    cyRef.current = cy;
    useGraphStore.getState().setCy(cy);
    cy.on("tap", "node", (event) => {
      const id = event.target.id() as string;
      if (id === "__tree-root") return;
      const rendered = event.renderedPosition;
      const original = event.originalEvent as MouseEvent | undefined;
      const { hideNode, selectNode } = useGraphStore.getState();
      if (event.target.hasClass("tree-group")) {
        onNodeTapRef.current?.(id, rendered.x, rendered.y);
        return;
      }
      if (isSyntheticTreeId(id)) return;
      if (original?.shiftKey) {
        hideNode(id);
        return;
      }
      selectNode(id);
      onNodeTapRef.current?.(id, rendered.x, rendered.y);
    });
    cy.on("dbltap", "node", (event) => {
      const id = event.target.id() as string;
      if (isSyntheticTreeId(id) || event.target.hasClass("tree-group")) return;
      onExploreRef.current?.(id);
    });
    cy.on("cxttap", "node", (event) => {
      const id = event.target.id() as string;
      if (isSyntheticTreeId(id) || event.target.hasClass("tree-group")) return;
      event.originalEvent?.preventDefault();
      const rendered = event.renderedPosition;
      onContextMenuRef.current?.(id, rendered.x, rendered.y);
    });
    cy.on("mouseover", "node", (event) => {
      const id = event.target.id() as string;
      if (isSyntheticTreeId(id) || event.target.hasClass("tree-group")) return;
      useGraphStore.getState().setHovered(id);
    });
    cy.on("mouseout", "node", () => useGraphStore.getState().setHovered(null));
    cy.on("tap", (event) => {
      if (event.target === cy) useGraphStore.getState().selectNode(null);
    });

    let cancelled = false;
    const observer = new ResizeObserver(() => {
      if (cancelled) return;
      cy.resize();
      if (
        !layoutRunningRef.current &&
        cy.elements().length > 0 &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        cy.fit(undefined, 64);
      }
    });
    observer.observe(container);
    requestAnimationFrame(() => {
      if (cancelled) return;
      cy.resize();
      if (
        !layoutRunningRef.current &&
        cy.elements().length > 0 &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        cy.fit(undefined, 64);
      }
    });
    const blockMenu = (event: Event): void => event.preventDefault();
    container.addEventListener("contextmenu", blockMenu);

    return () => {
      cancelled = true;
      observer.disconnect();
      container.removeEventListener("contextmenu", blockMenu);
      useGraphStore.getState().setCy(null);
      layoutRunningRef.current = false;
      cy.destroy();
      cyRef.current = null;
    };
  }, [layoutMode, snapshot.scanId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const previousRequest = lastLayoutRequest.current;
    const relayoutRequested =
      previousRequest === null ||
      previousRequest.mode !== layoutMode ||
      previousRequest.nonce !== layoutNonce ||
      previousRequest.scanId !== snapshot.scanId;
    lastLayoutRequest.current = {
      mode: layoutMode,
      nonce: layoutNonce,
      scanId: snapshot.scanId,
    };

    cy.json({ elements: elementsRef.current });

    // Force layouts are intentionally expensive. Keep the existing placement
    // while filters change, and only recompute it when the user switches or
    // explicitly requests a relayout.
    const shouldRunLayout = layoutMode !== "force" || relayoutRequested;
    layoutRunningRef.current = shouldRunLayout;
    let cancelled = false;
    const fitAfterLayout = (): void => {
      if (cancelled) return;
      layoutRunningRef.current = false;
      try {
        cy.resize();
        cy.fit(undefined, 64);
      } catch {
        // Cytoscape can already be destroyed by the time this frame runs.
      }
    };

    if (shouldRunLayout) {
      // Fit only after Cytoscape has finished positioning nodes. Fitting on the
      // first animation frame sees every node at its origin and zooms in on a
      // tiny bounding box, which makes the global graph look like a pile of
      // oversized labels.
      cy.one("layoutstop", fitAfterLayout);
      runLayout(cy, layoutMode, snapshot.originDomain, relayoutRequested);
      if (cy.nodes().length === 0) fitAfterLayout();
    } else {
      requestAnimationFrame(fitAfterLayout);
    }

    return () => {
      cancelled = true;
      layoutRunningRef.current = false;
    };
  }, [elementsKey, layoutMode, layoutNonce, snapshot.originDomain]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyFocus(cy, selectedNode, actives, showLabels);
  }, [actives, selectedNode, showLabels]);

  return (
    <div className="relative h-full min-h-[240px] w-full flex-1">
      <div
        ref={containerRef}
        className="graph-stage h-full min-h-[240px] w-full flex-1"
      />
      {filtered.nodes.length <= 1 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-[13px] text-mute">
          {filtered.nodes.length === 0
            ? "No connections match these filters. Reset filters to show the full map."
            : "Nothing third-party loaded into this page. Turn on Links or Site assets if you want outbound pages and first-party CDNs."}
        </p>
      ) : null}
    </div>
  );
});
