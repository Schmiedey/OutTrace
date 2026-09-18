import type { Core, Css, ElementDefinition, LayoutOptions } from "cytoscape";
import { isFirstPartyDomain } from "@/src/analysis/firstParty";
import { tint, VIZ_CATEGORY_COLORS } from "@/src/graph/colors";
import {
  TRACKER_CATEGORIES,
  type DomainCategory,
  type GraphNodeRecord,
  type ScanGraphSnapshot,
} from "@/src/types/graph";

function measureWidth(
  label: string,
  min: number,
  max: number,
  pad: number,
): number {
  return Math.max(min, Math.min(max, Math.round(label.length * 7.6 + pad)));
}

function originIdOf(
  snapshot: ScanGraphSnapshot,
  nodes: ScanGraphSnapshot["nodes"],
): string | null {
  // The global graph has multiple site roots. Use the synthetic "All sites"
  // root instead of whichever site happens to be first in the merged data.
  if (snapshot.originDomain === "global") return null;
  return (
    nodes.find((node) => node.isOrigin)?.domain ??
    nodes.find((node) => node.domain === snapshot.originDomain)?.domain ??
    null
  );
}

const TREE_GROUPS = [
  "site",
  "trackers",
  "social",
  "media",
  "services",
] as const;
type TreeGroup = (typeof TREE_GROUPS)[number];

const TREE_GROUP_META: Record<TreeGroup, { label: string; color: string }> = {
  site: { label: "Site assets", color: "#171717" },
  trackers: { label: "Trackers", color: "#e11d48" },
  social: { label: "Social", color: "#ea580c" },
  media: { label: "Media", color: "#db2777" },
  services: { label: "Other services", color: "#64748b" },
};

function treeGroupOf(node: GraphNodeRecord, origin: string): TreeGroup {
  const firstParty =
    node.isFirstParty || isFirstPartyDomain(origin, node.domain);
  if (firstParty) return "site";
  if (TRACKER_CATEGORIES.has(node.category)) return "trackers";
  if (node.category === "social") return "social";
  if (node.category === "media") return "media";
  return "services";
}

export const TREE_NODE_STYLE: Css.Node = {
  shape: "round-rectangle",
  width: "data(w)",
  height: "data(h)",
  "background-color": "data(color)",
  "background-opacity": 1,
  "border-width": "data(borderW)",
  "border-color": "data(accent)",
  label: "data(label)",
  color: "#171717",
  "font-size": 12,
  "font-family": "IBM Plex Sans, ui-sans-serif, sans-serif",
  "font-weight": 400,
  "text-valign": "center",
  "text-halign": "center",
  "text-wrap": "wrap",
  "text-max-width": "data(textW)",
  "text-outline-width": 0,
  "overlay-opacity": 0,
  "z-index": 10,
};

export const TREE_STYLESHEET: cytoscape.StylesheetStyle[] = [
  { selector: "node", style: TREE_NODE_STYLE },
  {
    selector: "node.origin",
    style: {
      "background-color": "#171717",
      "border-width": 0,
      color: "#ffffff",
      "font-size": 13,
      "font-weight": 500,
      "text-wrap": "wrap",
      "text-max-width": "data(textW)",
      "z-index": 30,
    },
  },
  {
    selector: "node.tree-group",
    style: {
      color: "#171717",
      "font-weight": 600,
      "font-size": 11,
      "border-width": 2,
      "z-index": 20,
    },
  },
  {
    selector: "node.tree-leaf",
    style: {
      "text-halign": "center",
      "text-margin-x": 0,
      "border-width": 1.5,
      color: "#171717",
    },
  },
  {
    selector: "node.nolabel",
    style: { label: "" },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#d4d4d4",
      "curve-style": "taxi",
      "taxi-direction": "rightward",
      "taxi-turn": 18,
      "taxi-turn-min-distance": 12,
      "target-arrow-shape": "none",
      "source-endpoint": "outside-to-node",
      "target-endpoint": "outside-to-node",
      opacity: 1,
      "overlay-opacity": 0,
    },
  },
  {
    selector: ".faded",
    style: { opacity: 0.1 },
  },
  {
    selector: ".highlighted",
    style: { opacity: 1, "z-index": 40 },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 2.5,
      "border-color": "#171717",
      "z-index": 50,
    },
  },
];

export function isSyntheticTreeId(id: string): boolean {
  return id.startsWith("tree-group:") || id === "__tree-root";
}

export function isTreeGroupId(id: string): boolean {
  return id.startsWith("tree-group:");
}

export function nodesInTreeGroup(
  groupId: string,
  origin: string,
  nodes: ScanGraphSnapshot["nodes"],
): GraphNodeRecord[] {
  const group = groupId.replace("tree-group:", "") as TreeGroup;
  if (!TREE_GROUPS.includes(group)) return [];
  return nodes
    .filter((node) => !node.isOrigin && treeGroupOf(node, origin) === group)
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount || a.domain.localeCompare(b.domain),
    );
}

export function treePathIds(
  selected: string,
  snapshot: ScanGraphSnapshot,
  nodes: ScanGraphSnapshot["nodes"],
): string[] {
  const origin =
    originIdOf(snapshot, nodes) ??
    (snapshot.originDomain === "global"
      ? "__tree-root"
      : snapshot.originDomain);
  if (selected === origin) return [selected];
  const node = nodes.find((item) => item.domain === selected);
  if (!node) return [origin, selected];
  const group = treeGroupOf(node, snapshot.originDomain);
  return [origin, `tree-group:${group}`, selected];
}

export function buildTreeElements(
  snapshot: ScanGraphSnapshot,
  nodes: ScanGraphSnapshot["nodes"],
  _edges: ScanGraphSnapshot["edges"],
): ElementDefinition[] {
  const originId = originIdOf(snapshot, nodes);
  const leaves = nodes.filter((node) => node.domain !== originId);
  const grouped = new Map<TreeGroup, ScanGraphSnapshot["nodes"]>();

  for (const node of leaves) {
    const group = treeGroupOf(node, snapshot.originDomain);
    const list = grouped.get(group) ?? [];
    list.push(node);
    grouped.set(group, list);
  }

  for (const list of grouped.values()) {
    list.sort(
      (a, b) =>
        b.referenceCount - a.referenceCount || a.domain.localeCompare(b.domain),
    );
  }

  const groups = TREE_GROUPS.filter((group) => grouped.has(group));
  const originLabel =
    originId && originId !== "global"
      ? originId
      : snapshot.originDomain === "global"
        ? "All sites"
        : snapshot.originDomain;
  const originDataId = originId ?? "__tree-root";
  const originW = measureWidth(originLabel, 180, 320, 64);
  const originH = originLabel.length > 22 ? 64 : 52;

  const elements: ElementDefinition[] = [
    {
      group: "nodes",
      data: {
        id: originDataId,
        label: originLabel,
        color: "#171717",
        accent: "#171717",
        borderW: 0,
        w: originW,
        h: originH,
        textW: originW - 28,
        order: 0,
      },
      classes: "origin",
    },
  ];

  groups.forEach((group, typeIndex) => {
    const children = grouped.get(group);
    if (!children?.length) return;
    const groupId = `tree-group:${group}`;
    const meta = TREE_GROUP_META[group];
    const accent = meta.color;
    const groupLabel = `${meta.label} · ${String(children.length)}`;
    const groupW = measureWidth(groupLabel, 112, 210, 36);
    elements.push({
      group: "nodes",
      data: {
        id: groupId,
        label: groupLabel,
        color: tint(accent, 0.82),
        accent,
        borderW: 2,
        w: groupW,
        h: 36,
        textW: groupW - 16,
        order: typeIndex + 1,
      },
      classes: "tree-group",
    });
    elements.push({
      group: "edges",
      data: {
        id: `tree-edge:${originDataId}:${groupId}`,
        source: originDataId,
        target: groupId,
        color: accent,
      },
    });

    children.forEach((node, leafIndex) => {
      const category: DomainCategory =
        node.category === "origin" ? "unknown" : node.category;
      const accentColor = VIZ_CATEGORY_COLORS[category];
      const leafW = measureWidth(node.domain, 140, 280, 36);
      elements.push({
        group: "nodes",
        data: {
          id: node.domain,
          label: node.domain,
          color: tint(accentColor, 0.88),
          accent: accentColor,
          borderW: 1.5,
          w: leafW,
          h: 36,
          textW: leafW - 20,
          order: leafIndex,
          parentGroup: groupId,
        },
        classes: `tree-leaf ${category}`,
      });
      elements.push({
        group: "edges",
        data: {
          id: `tree-edge:${groupId}:${node.domain}`,
          source: groupId,
          target: node.domain,
          color: accent,
        },
      });
    });
  });

  return elements;
}

export function runTreeLayout(cy: Core, animate = true): void {
  const origin = cy.nodes(".origin").first();
  const groups = cy
    .nodes(".tree-group")
    .sort(
      (a, b) => Number(a.data("order") ?? 0) - Number(b.data("order") ?? 0),
    );
  const positions = new Map<string, { x: number; y: number }>();

  const row = 44;
  const groupGap = 36;
  const groupX = 240;
  const leafX = 490;
  const columnGap = 300;
  const maxRows = 18;

  let y = 0;
  groups.forEach((group) => {
    const leaves = group
      .outgoers("node")
      .sort(
        (a, b) => Number(a.data("order") ?? 0) - Number(b.data("order") ?? 0),
      );
    const start = y;
    const rows = Math.max(1, Math.min(maxRows, leaves.length));
    leaves.forEach((leaf, index) => {
      const column = Math.floor(index / rows);
      const rowIndex = index % rows;
      positions.set(leaf.id(), {
        x: leafX + column * columnGap,
        y: start + rowIndex * row,
      });
    });
    const end = start + Math.max(rows - 1, 0) * row;
    positions.set(group.id(), { x: groupX, y: (start + end) / 2 });
    y = end + row + groupGap;
  });

  if (origin.nonempty()) {
    const ys = [...positions.values()].map((point) => point.y);
    const mid = ys.length > 0 ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    positions.set(origin.id(), { x: 0, y: mid });
  }

  const positionMap: Record<string, { x: number; y: number }> =
    Object.fromEntries(positions);

  cy.layout({
    name: "preset",
    positions: positionMap,
    animate,
    animationDuration: animate ? 560 : 0,
    animationEasing: "ease-out",
    fit: true,
    padding: 80,
  } as LayoutOptions).run();
}
