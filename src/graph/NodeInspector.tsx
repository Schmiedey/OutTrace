import { Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DomainActions } from "@/src/components/DomainActions";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { OwnerGroups } from "@/src/components/OwnerGroups";
import { WhyChain } from "@/src/components/WhyChain";
import { useGraphStore } from "@/src/graph/useGraphStore";
import { classificationLabel, identifyDomain, riskLabel, seenOnShare } from "@/src/analysis/identity";
import { groupSnapshotByOwner, siblingsFromOwner } from "@/src/analysis/owners";
import { loadChainFor } from "@/src/analysis/why";
import { formatShortDate } from "@/src/lib/utils";
import { getDomain } from "@/src/storage/domains";
import { isFollowedDomain, toggleFollowDomain } from "@/src/storage/follows";
import { listSites } from "@/src/storage/scans";
import { CONNECTION_TYPE_LABELS, type DomainRow, type ScanGraphSnapshot } from "@/src/types/graph";

export function NodeInspector({ snapshot }: { snapshot: ScanGraphSnapshot }) {
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [row, setRow] = useState<DomainRow | undefined>(undefined);
  const [siteCount, setSiteCount] = useState(0);
  const owners = useMemo(() => groupSnapshotByOwner(snapshot), [snapshot]);

  const node = snapshot.nodes.find((item) => item.domain === selectedNode);
  const edges = useMemo(() => {
    if (!selectedNode) return [];
    return snapshot.edges.filter((edge) => edge.source === selectedNode || edge.target === selectedNode);
  }, [selectedNode, snapshot.edges]);
  const siblings = selectedNode ? siblingsFromOwner(snapshot, selectedNode) : [];

  useEffect(() => {
    if (!selectedNode) return;
    void isFollowedDomain(selectedNode).then(setFollowed);
    void getDomain(selectedNode).then(setRow);
    void listSites().then((sites) => setSiteCount(sites.length));
  }, [selectedNode]);

  if (!selectedNode || !node) {
    return (
      <aside className="flex h-full w-[min(340px,40vw)] shrink-0 flex-col overflow-hidden border-l border-line bg-panel">
        <div className="border-b border-line px-4 py-3">
          <p className="text-[15px] font-medium text-ink">Who receives data</p>
          <p className="mt-0.5 text-[12px] text-mute">Companies behind the third-party domains on this map.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <OwnerGroups groups={owners} />
        </div>
      </aside>
    );
  }

  const evidence = edges.flatMap((edge) => edge.evidence).slice(0, 12);
  const identity = identifyDomain(node.domain);

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(node.domain);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside className="flex h-full w-[min(340px,40vw)] shrink-0 flex-col overflow-hidden border-l border-line bg-panel">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-ink">{identifyDomain(node.domain).name}</p>
          <p className="mt-0.5 truncate text-[12px] text-mute">{node.domain}</p>
        </div>
        <button type="button" onClick={() => selectNode(null)} className="shrink-0 text-mute hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <Stat label="Type" value={node.isFirstParty && !node.isOrigin ? "First party" : identity.typeLabel} />
          <Stat label="Owned by" value={node.owner ?? "Unlisted"} />
          <Stat
            label="Found on"
            value={row ? seenOnShare(row.seenOnCount, siteCount || 1) : snapshot.originDomain}
          />
          <Stat
            label="Risk"
            value={`${riskLabel(identity.risk)}${row ? ` · first ${formatShortDate(row.firstSeen)}` : ""}`}
          />
        </div>
        <Stat
          label="Classification"
          value={classificationLabel(
            node.classificationSource ?? identity.classificationSource,
            node.classificationConfidence ?? identity.classificationConfidence,
          )}
        />
        <section>
          <h3 className="mb-2 text-[12px] text-mute">Hostnames</h3>
          <ul className="space-y-1">
            {node.hostnames.map((host) => (
              <li key={host} className="truncate text-[13px] text-ink">
                {host}
              </li>
            ))}
          </ul>
        </section>
        {siblings.length > 0 ? (
          <section>
            <h3 className="mb-2 text-[12px] text-mute">Also from {node.owner}</h3>
            <ul className="space-y-1">
              {siblings.map((item) => (
                <li key={item.domain}>
                  <button
                    type="button"
                    className="text-left text-[13px] text-ink hover:underline"
                    onClick={() => selectNode(item.domain)}
                  >
                    {item.domain}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!node.isOrigin ? (
          <WhyChain chain={loadChainFor(snapshot, node.domain)} onSelect={(domain) => selectNode(domain)} />
        ) : null}
        <section>
          <h3 className="mb-2 text-[12px] text-mute">Evidence</h3>
          <div className="space-y-3">
            {evidence.length === 0 ? (
              <p className="text-[13px] text-mute">No evidence snippets stored for this node.</p>
            ) : (
              evidence.map((item, index) => (
                <div key={`${item.url}-${String(index)}`} className="rounded-md border border-line bg-canvas p-2.5">
                  <Badge>{CONNECTION_TYPE_LABELS[item.type]}</Badge>
                  {item.context ? <p className="mt-1.5 text-[12px] text-mute">{item.context}</p> : null}
                  <p className="mt-1 break-all text-[11px] text-mute">{item.url}</p>
                  <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-mute">
                    {item.snippet}
                  </pre>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-3">
        {!node.isOrigin ? (
          <DomainActions
            domain={node.domain}
            followed={followed}
            onFollow={() => {
              void toggleFollowDomain(node.domain).then(setFollowed);
            }}
          />
        ) : null}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => void copy()}>
            <Copy className="h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => window.open(`https://${node.domain}`, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </Button>
        </div>
        {followed ? (
          <Link to="/following" className="text-center text-[12px] text-mute hover:text-ink">
            View watched domains
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-mute">{label}</div>
      <div className="mt-0.5 break-words text-[13px] text-ink">{value}</div>
    </div>
  );
}
