import { GitBranch, Orbit, RotateCcw, Spline } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import {
  GRAPH_LAYOUT_LABELS,
  GRAPH_LAYOUT_MODES,
  type GraphLayoutMode,
} from "@/src/graph/layouts";
import { useGraphStore } from "@/src/graph/useGraphStore";
import type { CategoryLens } from "@/src/graph/filters";
import { CONNECTION_TYPE_LABELS, type ConnectionType } from "@/src/types/graph";
import { cn } from "@/src/lib/utils";

const FILTER_TYPES: ConnectionType[] = [
  "script",
  "iframe",
  "network",
  "image",
  "stylesheet",
  "font",
  "media",
  "link",
];

const LENSES: { id: CategoryLens; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trackers", label: "Trackers" },
  { id: "advertising", label: "Ads" },
  { id: "analytics", label: "Analytics" },
  { id: "cdn", label: "CDNs" },
  { id: "social", label: "Social" },
  { id: "unknown", label: "Unknown" },
  { id: "new", label: "New" },
];

const LAYOUT_ICONS: Record<GraphLayoutMode, typeof Orbit> = {
  radial: Orbit,
  tree: GitBranch,
  force: Spline,
};

export function GraphToolbar({ extras }: { extras?: ReactNode }) {
  const enabledTypes = useGraphStore((state) => state.enabledTypes);
  const toggleType = useGraphStore((state) => state.toggleType);
  const showLabels = useGraphStore((state) => state.showLabels);
  const setShowLabels = useGraphStore((state) => state.setShowLabels);
  const thirdPartyOnly = useGraphStore((state) => state.thirdPartyOnly);
  const setThirdPartyOnly = useGraphStore((state) => state.setThirdPartyOnly);
  const hideCommonInfra = useGraphStore((state) => state.hideCommonInfra);
  const setHideCommonInfra = useGraphStore((state) => state.setHideCommonInfra);
  const hideFirstParty = useGraphStore((state) => state.hideFirstParty);
  const setHideFirstParty = useGraphStore((state) => state.setHideFirstParty);
  const categoryLens = useGraphStore((state) => state.categoryLens);
  const setCategoryLens = useGraphStore((state) => state.setCategoryLens);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const resetLayout = useGraphStore((state) => state.resetLayout);
  const resetFilters = useGraphStore((state) => state.resetFilters);

  return (
    <div className="z-20 shrink-0 border-t border-line bg-canvas px-6 py-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {LENSES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategoryLens(item.id)}
              className={cn(
                "rounded-md px-2 py-1 text-[12px]",
                categoryLens === item.id ? "bg-ink text-canvas" : "text-mute hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TYPES.map((type) => {
            const on = enabledTypes[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={cn(
                  "rounded-md px-2 py-1 text-[12px]",
                  on ? "bg-raised text-ink" : "text-mute hover:text-ink",
                )}
              >
                {CONNECTION_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line">
            {GRAPH_LAYOUT_MODES.map((mode) => {
              const Icon = LAYOUT_ICONS[mode];
              const on = layoutMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayoutMode(mode)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 px-2.5 text-[12px]",
                    on ? "bg-raised text-ink" : "text-mute hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {GRAPH_LAYOUT_LABELS[mode]}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowLabels(!showLabels)}>
            {showLabels ? "Labels" : "No labels"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setThirdPartyOnly(!thirdPartyOnly)}>
            {thirdPartyOnly ? "Trackers only" : "All third parties"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHideFirstParty(!hideFirstParty)}>
            {hideFirstParty ? "Site assets hidden" : "Site assets"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHideCommonInfra(!hideCommonInfra)}>
            {hideCommonInfra ? "Infra hidden" : "Hide infra"}
          </Button>
          <Button variant="subtle" size="sm" onClick={resetLayout}>
            <RotateCcw className="h-3 w-3" />
            Relayout
          </Button>
          <Button variant="subtle" size="sm" onClick={resetFilters}>
            Reset
          </Button>
          <span className="text-[11px] text-mute">Select a node · Delete to hide</span>
          {extras}
        </div>
      </div>
    </div>
  );
}
