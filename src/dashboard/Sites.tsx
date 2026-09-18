import { Link } from "react-router-dom";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { getLatestScanForSite, listSites } from "@/src/storage/scans";
import { useEffect, useState } from "react";
import type { ScanRow, SiteRow } from "@/src/types/graph";

export function SitesPage() {
  const sites = useAsync(() => listSites(), []);
  const [latest, setLatest] = useState<Record<number, ScanRow>>({});

  useEffect(() => {
    const rows = sites.data;
    if (!rows) return;
    let cancelled = false;
    void Promise.all(
      rows.map(async (site) => {
        if (site.id === undefined) return null;
        const scan = await getLatestScanForSite(site.id);
        return scan ? ([site.id, scan] as const) : null;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<number, ScanRow> = {};
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1];
      }
      setLatest(next);
    });
    return () => {
      cancelled = true;
    };
  }, [sites.data]);

  return (
    <div className="px-10 py-10">
      <header className="mb-8">
        <h1 className="font-display text-4xl">Sites</h1>
      </header>
      <div className="grid gap-2">
        {sites.data?.map((site) => (
          <SiteCard key={site.domain} site={site} latest={site.id ? latest[site.id] : undefined} />
        ))}
        {!sites.data?.length ? <p className="text-mute">No sites stored yet.</p> : null}
      </div>
    </div>
  );
}

function SiteCard({ site, latest }: { site: SiteRow; latest: ScanRow | undefined }) {
  const now = Date.now();
  return (
    <div className="flex items-center justify-between border-b border-line py-4">
      <div>
        <div className="text-[16px] font-medium">
          {site.id !== undefined ? (
            <Link to={`/sites/${String(site.id)}`} className="hover:underline">
              {site.domain}
            </Link>
          ) : (
            site.domain
          )}
        </div>
        <div className="mt-1 text-[12px] text-mute">
          Scanned {formatCount(site.scanCount)} times · First {formatRelativeTime(site.firstSeen, now)} · Last{" "}
          {formatRelativeTime(site.lastSeen, now)}
          {latest
            ? ` · ${formatCount(latest.trackerCount)} trackers`
            : ""}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {latest?.id !== undefined ? (
          <Link to={`/graph/${String(latest.id)}`} className="text-[13px] text-ink hover:underline">
            Latest graph
          </Link>
        ) : null}
        <Link
          to={`/audits/new?url=${encodeURIComponent(latest?.url ?? `https://${site.domain}/`)}`}
          className="text-[13px] text-ink hover:underline"
        >
          Audit site
        </Link>
        {site.id !== undefined ? (
          <Link to={`/sites/${String(site.id)}`} className="text-[13px] text-mute hover:text-ink">
            History
          </Link>
        ) : null}
      </div>
    </div>
  );
}
