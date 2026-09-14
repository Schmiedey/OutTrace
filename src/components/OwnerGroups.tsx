import { Link } from "react-router-dom";
import { Badge } from "@/src/components/ui/badge";
import type { OwnerGroup } from "@/src/analysis/owners";
import { formatCount } from "@/src/lib/utils";

export function OwnerGroups({
  groups,
  empty = "No third-party companies on this scan.",
  limit = 12,
}: {
  groups: OwnerGroup[];
  empty?: string;
  limit?: number;
}) {
  const listed = groups.filter((group) => !group.unlisted).slice(0, limit);
  const unlisted = groups.find((group) => group.unlisted);
  if (listed.length === 0 && !unlisted) {
    return <p className="text-[14px] text-mute">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-line border-y border-line">
      {listed.map((group) => (
        <li key={group.owner} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-[14px] text-ink">{group.owner}</div>
            <div className="mt-0.5 truncate text-[12px] text-mute">
              {group.domains
                .slice(0, 4)
                .map((node) => node.domain)
                .join(" · ")}
              {group.domains.length > 4 ? ` · +${String(group.domains.length - 4)}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[12px] text-mute">
            {group.siteCount !== undefined ? (
              <span>
                {formatCount(group.siteCount)} site{group.siteCount === 1 ? "" : "s"}
              </span>
            ) : null}
            <span>{formatCount(group.domains.length)}</span>
            {group.trackerCount > 0 ? <Badge tone="rose">{formatCount(group.trackerCount)}</Badge> : null}
          </div>
        </li>
      ))}
      {unlisted ? (
        <li className="flex items-start justify-between gap-4 py-3">
          <div>
            <div className="text-[14px] text-ink">Unlisted companies</div>
            <div className="mt-0.5 text-[12px] text-mute">
              {formatCount(unlisted.domains.length)} domains with no identified owner
            </div>
          </div>
          {unlisted.trackerCount > 0 ? <Badge tone="rose">{formatCount(unlisted.trackerCount)}</Badge> : null}
        </li>
      ) : null}
    </ul>
  );
}

export function OwnerDomainLinks({ domains }: { domains: { domain: string }[] }) {
  if (domains.length === 0) return null;
  return (
    <ul className="space-y-1">
      {domains.map((node) => (
        <li key={node.domain}>
          <Link to={`/domains/${encodeURIComponent(node.domain)}`} className="text-[13px] text-ink hover:underline">
            {node.domain}
          </Link>
        </li>
      ))}
    </ul>
  );
}
