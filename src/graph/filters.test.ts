import { describe, expect, it } from "vitest";
import {
  defaultEnabledTypes,
  filterSnapshot,
  type GraphFilterState,
} from "@/src/graph/filters";
import {
  CONNECTION_TYPES,
  type GraphEdgeRecord,
  type GraphNodeRecord,
} from "@/src/types/graph";

const origin = "example.test";
const nodes: GraphNodeRecord[] = [
  {
    id: origin,
    domain: origin,
    category: "origin",
    isOrigin: true,
    isSite: true,
    isFirstParty: true,
    referenceCount: 1,
    hostnames: [origin],
  },
  {
    id: "analytics.example",
    domain: "analytics.example",
    category: "analytics",
    isOrigin: false,
    isSite: false,
    isFirstParty: false,
    referenceCount: 1,
    hostnames: ["analytics.example"],
  },
  {
    id: "cdn.example",
    domain: "cdn.example",
    category: "cdn",
    isOrigin: false,
    isSite: false,
    isFirstParty: false,
    referenceCount: 1,
    hostnames: ["cdn.example"],
  },
];
const edges: GraphEdgeRecord[] = [
  {
    id: "script",
    source: origin,
    target: "analytics.example",
    type: "script",
    count: 1,
    evidence: [],
  },
  {
    id: "image",
    source: origin,
    target: "cdn.example",
    type: "image",
    count: 1,
    evidence: [],
  },
];

function filters(overrides: Partial<GraphFilterState> = {}): GraphFilterState {
  return {
    enabledTypes: defaultEnabledTypes(),
    thirdPartyOnly: false,
    hideCommonInfra: false,
    hideFirstParty: true,
    searchQuery: "",
    categoryLens: "all",
    hiddenDomains: [],
    newDomains: [],
    ...overrides,
  };
}

describe("graph defaults", () => {
  it("shows every connection type on first open", () => {
    const enabled = defaultEnabledTypes();
    for (const type of CONNECTION_TYPES) expect(enabled[type]).toBe(true);
  });

  it("filters edges once and keeps only their connected nodes", () => {
    const enabledTypes = defaultEnabledTypes();
    enabledTypes.image = false;
    const result = filterSnapshot(
      nodes,
      edges,
      filters({ enabledTypes }),
      origin,
    );
    expect(result.nodes.map((node) => node.domain)).toEqual([
      origin,
      "analytics.example",
    ]);
    expect(result.edges.map((edge) => edge.id)).toEqual(["script"]);
  });

  it("always keeps the site node visible when a lens has no matches", () => {
    const result = filterSnapshot(
      nodes,
      edges,
      filters({ categoryLens: "social" }),
      origin,
    );
    expect(result.nodes.map((node) => node.domain)).toEqual([origin]);
    expect(result.edges).toEqual([]);
  });
});
