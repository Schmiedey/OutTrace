export const GRAPH_LAYOUT_MODES = ["radial", "tree", "force"] as const;

export type GraphLayoutMode = (typeof GRAPH_LAYOUT_MODES)[number];

/** Dense global graphs need a quieter label treatment and more breathing room. */
export const DENSE_GLOBAL_NODE_THRESHOLD = 48;

export const GRAPH_LAYOUT_LABELS: Record<GraphLayoutMode, string> = {
  radial: "Radial",
  tree: "Tree",
  force: "Force",
};
