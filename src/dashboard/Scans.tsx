import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { FilterChip, SearchInput } from "@/src/components/SearchControls";
import { formatCount, formatRelativeTime } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { listAllScans, setScanSaved } from "@/src/storage/scans";

type CaptureFilter = "all" | "snapshot" | "watch" | "scheduled";
type ScanSort = "newest" | "trackers" | "third";

export function ScansPage() {
  const now = Date.now();
  const scans = useAsync(listAllScans, []);
  const [query, setQuery] = useState("");
  const [capture, setCapture] = useState<CaptureFilter>("all");
  const [sort, setSort] = useState<ScanSort>("newest");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const toggleSaved = async (id: number, saved: boolean): Promise<void> => {
    setSaving(id);
    setSaveError(null);
    try {
      await setScanSaved(id, saved);
      scans.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save scan.");
    } finally {
      setSaving(null);
    }
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = [...(scans.data ?? [])];
    if (savedOnly) list = list.filter((scan) => scan.savedAt !== undefined);
    if (needle) {
      list = list.filter(
        (scan) =>
          scan.domain.toLowerCase().includes(needle) ||
          scan.title.toLowerCase().includes(needle) ||
          scan.url.toLowerCase().includes(needle),
      );
    }
    if (capture !== "all") {
      list = list.filter((scan) => (scan.captureMode ?? "snapshot") === capture);
    }
    list.sort((a, b) => {
      if (sort === "trackers") return b.trackerCount - a.trackerCount || b.timestamp - a.timestamp;
      if (sort === "third") return b.thirdPartyCount - a.thirdPartyCount || b.timestamp - a.timestamp;
      return b.timestamp - a.timestamp;
    });
    return list;
  }, [scans.data, query, capture, sort, savedOnly]);

  return (
    <div className="px-10 py-10">
      <header className="mb-6">
        <h1 className="font-display text-4xl">Scan snapshots</h1>
        <p className="mt-2 max-w-xl text-[14px] text-mute">Save important scans to keep them out of automatic history cleanup. Saved scans stay in this browser; export a backup for recovery.</p>
      </header>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search site, title, or URL"
          aria-label="Search scans"
        />
        <FilterChip on={capture === "all"} onClick={() => setCapture("all")}>
          All
        </FilterChip>
        <FilterChip on={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>Saved only</FilterChip>
        <FilterChip on={capture === "snapshot"} onClick={() => setCapture("snapshot")}>
          Snapshot
        </FilterChip>
        <FilterChip on={capture === "watch"} onClick={() => setCapture("watch")}>
          Watch
        </FilterChip>
        <FilterChip on={capture === "scheduled"} onClick={() => setCapture("scheduled")}>
          Scheduled
        </FilterChip>
        <span className="mx-1 text-line">·</span>
        <FilterChip on={sort === "newest"} onClick={() => setSort("newest")}>
          Newest
        </FilterChip>
        <FilterChip on={sort === "trackers"} onClick={() => setSort("trackers")}>
          Most trackers
        </FilterChip>
        <FilterChip on={sort === "third"} onClick={() => setSort("third")}>
          Most third parties
        </FilterChip>
      </div>
      {saveError && <p role="alert" className="mb-4 text-red-700">{saveError}</p>}
      {rows.length ? (
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] text-mute">
            <tr>
              <th className="pb-2 font-normal">Site</th>
              <th className="pb-2 font-normal">Third parties</th>
              <th className="pb-2 font-normal">Trackers</th>
              <th className="pb-2 font-normal">Capture</th>
              <th className="pb-2 font-normal">When</th>
              <th className="pb-2 font-normal">Saved</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((scan) => {
              return (
                <tr key={scan.id} className="border-t border-line">
                  <td className="py-3">
                    <Link to={`/sites/${String(scan.siteId)}`} className="text-ink hover:underline">
                      {scan.domain}
                    </Link>
                    <div className="max-w-md truncate text-[12px] text-mute">{scan.url}</div>
                  </td>
                  <td className="py-3">{formatCount(scan.thirdPartyCount)}</td>
                  <td className="py-3">{formatCount(scan.trackerCount)}</td>
                  <td className="py-3 text-mute">{scan.captureMode === "watch" ? "Watch" : scan.captureMode === "scheduled" ? "Scheduled" : "Snapshot"}</td>
                  <td className="py-3 text-mute">{formatRelativeTime(scan.timestamp, now)}</td>
                  <td className="py-3">
                    <button type="button" className="text-ink hover:underline disabled:opacity-50" disabled={scan.id === undefined || saving !== null} aria-pressed={scan.savedAt !== undefined} aria-label={`${scan.savedAt !== undefined ? "Unsave" : "Save"} scan of ${scan.domain}`} onClick={() => scan.id !== undefined && void toggleSaved(scan.id, scan.savedAt === undefined)}>
                      {saving === scan.id ? "Saving…" : scan.savedAt !== undefined ? "Saved · Unsave" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : scans.data?.length ? (
        <p className="text-mute">No snapshots match that filter.</p>
      ) : (
        <p className="text-mute">No snapshots yet. Scan a website from the extension popup.</p>
      )}
    </div>
  );
}
