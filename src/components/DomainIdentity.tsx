import {
  classificationLabel,
  identifyDomain,
  riskLabel,
  seenOnShare,
  type DomainIdentity,
} from "@/src/analysis/identity";
import { DomainActions } from "@/src/components/DomainActions";
import { WhyChain } from "@/src/components/WhyChain";
import { Badge } from "@/src/components/ui/badge";
import { formatShortDate } from "@/src/lib/utils";
import type { DomainRow, ScanGraphSnapshot } from "@/src/types/graph";
import { loadChainFor } from "@/src/analysis/why";

export function DomainIdentityCard({
  domain,
  row,
  siteCount,
  snapshot,
  followed,
  onFollow,
  onBack,
}: {
  domain: string;
  row?: DomainRow;
  siteCount?: number;
  snapshot?: ScanGraphSnapshot;
  followed?: boolean;
  onFollow?: () => void;
  onBack?: () => void;
}) {
  const identity: DomainIdentity = identifyDomain(domain);
  const chain = snapshot ? loadChainFor(snapshot, domain) : undefined;
  const node = snapshot?.nodes.find((item) => item.domain === domain);
  const classificationSource = node?.classificationSource ?? identity.classificationSource;
  const classificationConfidence = node?.classificationConfidence ?? identity.classificationConfidence;
  const riskTone = identity.risk === "high" ? "rose" : identity.risk === "medium" ? "amber" : "lime";

  return (
    <div className="space-y-4">
      {onBack ? (
        <button type="button" className="text-[12px] text-mute hover:text-ink" onClick={onBack}>
          Back
        </button>
      ) : null}
      <div>
        <p className="font-display text-[22px] leading-tight text-ink">{identity.name}</p>
        <p className="mt-0.5 break-all text-[12px] text-mute">{domain}</p>
      </div>
      <dl className="space-y-2.5 text-[13px]">
        <Fact label="Type" value={node?.isFirstParty && !node.isOrigin ? "First party" : identity.typeLabel} />
        <Fact
          label="Classification"
          value={classificationLabel(classificationSource, classificationConfidence)}
        />
        <Fact label="Owned by" value={identity.owner ?? "Unlisted"} />
        {siteCount !== undefined && row ? (
          <Fact label="Found on" value={seenOnShare(row.seenOnCount, siteCount)} />
        ) : null}
        {row ? <Fact label="First seen" value={formatShortDate(row.firstSeen)} /> : null}
        <div>
          <dt className="text-[12px] text-mute">Risk</dt>
          <dd className="mt-0.5">
            <Badge tone={riskTone}>{riskLabel(identity.risk)}</Badge>
          </dd>
        </div>
      </dl>
      {chain ? <WhyChain chain={chain} /> : <p className="text-[13px] text-mute">{identity.usedFor}</p>}
      <DomainActions domain={domain} followed={followed} onFollow={onFollow} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-mute">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
