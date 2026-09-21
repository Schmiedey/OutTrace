import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/src/lib/useAsync";
import { formatRelativeTime } from "@/src/lib/utils";
import { getPortfolio } from "@/src/storage/portfolio";
import { Button } from "@/src/components/ui/button";

export function SitesPage() {
  const portfolio = useAsync(getPortfolio, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    const refresh = () => portfolio.reload();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const rows = portfolio.data ?? [];
  const visible = rows.filter(
    (row) =>
      row.domain.includes(query.trim().toLowerCase()) &&
      (filter === "all" ||
        (filter === "review"
          ? row.pending.length > 0
          : !row.watch?.enabled ||
            !row.watch.accessGranted ||
            Boolean(row.watch.lastError))),
  );
  return (
    <div className="px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
            Client websites & sites you care about
          </p>
          <h1 className="font-display mt-2 text-4xl">Your site portfolio</h1>
          <p className="mt-3 max-w-xl text-[14px] text-mute">
            Review changes, check monitoring coverage, and prepare a report for
            your next client update.
          </p>
        </div>
        <Link
          to="/audits/new"
          className="rounded-md bg-ink px-4 py-2 text-[13px] text-canvas"
        >
          Check a website
        </Link>
      </header>
      <section className="my-8 grid grid-cols-3 gap-4 border-y border-line py-5">
        <Metric value={rows.length} label="Sites in this browser" />
        <Metric
          value={rows.filter((row) => row.pending.length > 0).length}
          label="With unread changes"
        />
        <Metric
          value={
            rows.filter(
              (row) =>
                row.watch?.enabled &&
                row.watch.accessGranted &&
                !row.watch.lastError,
            ).length
          }
          label="Watching enabled"
        />
      </section>
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          aria-label="Find a site"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a site…"
          className="h-10 rounded-md border border-line px-3"
        />
        <select
          aria-label="Filter portfolio"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="h-10 rounded-md border border-line bg-canvas px-3"
        >
          <option value="all">All sites</option>
          <option value="review">Unread changes</option>
          <option value="coverage">Needs monitoring setup or attention</option>
        </select>
        <Button variant="ghost" onClick={portfolio.reload}>
          Refresh
        </Button>
      </div>
      {portfolio.error ? (
        <p role="alert" className="text-rose">
          {portfolio.error}
        </p>
      ) : portfolio.loading && !portfolio.data ? (
        <p>Loading your portfolio…</p>
      ) : visible.length ? (
        <div className="divide-y divide-line border-y border-line">
          {visible.map((row) => {
            const event = row.pending[0];
            const monitoring = row.watch?.enabled
              ? !row.watch.accessGranted
                ? "Manual only · site access needed"
                : row.watch.lastError
                  ? `Check failed · ${row.watch.lastError}`
                  : row.watch.schedule === "visit"
                    ? "Watching when you visit"
                    : `Watching ${row.watch.schedule} · browser must be running`
              : "Monitoring not enabled";
            return (
              <article
                key={row.domain}
                className="flex flex-wrap items-center justify-between gap-5 py-5"
              >
                <div className="min-w-0">
                  <h2 className="text-[16px] font-medium">
                    {row.site?.id ? (
                      <Link
                        className="hover:underline"
                        to={`/sites/${row.site.id}`}
                      >
                        {row.domain}
                      </Link>
                    ) : (
                      row.domain
                    )}
                  </h2>
                  <p className="mt-1 text-[12px] text-mute">{monitoring}</p>
                  <p className="mt-1 text-[12px] text-mute">
                    {row.latest
                      ? `Last capture ${formatRelativeTime(row.latest.timestamp, Date.now())}`
                      : "No saved page capture yet"}
                  </p>
                  {event ? (
                    <p className="mt-2 max-w-xl text-[13px] text-amber">
                      {row.pending.length} unread{" "}
                      {row.pending.length === 1 ? "change" : "changes"} ·{" "}
                      {event.reasons
                        ?.filter((reason) => reason.importance !== "routine")
                        .map((reason) => reason.label)
                        .join(" · ") || "New tracking activity to review"}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-[13px]">
                  {event ? (
                    <Link
                      className="font-medium underline"
                      to={
                        event.fromScanId === event.toScanId
                          ? `/sites/${event.siteId}`
                          : `/diff/${event.fromScanId}/${event.toScanId}`
                      }
                    >
                      Review change
                    </Link>
                  ) : null}
                  {row.latest?.id ? (
                    <Link
                      className="underline"
                      to={`/reports/${row.latest.id}`}
                    >
                      Client report
                    </Link>
                  ) : null}
                  <Link
                    className="underline"
                    to={`/following?url=${encodeURIComponent(row.latest?.url ?? row.watch?.url ?? `https://${row.domain}`)}`}
                  >
                    {row.watch?.enabled ? "Manage monitoring" : "Watch site"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-line bg-panel p-8">
          <h2 className="font-display text-2xl">
            {rows.length
              ? "No sites match this view"
              : "Start with one website you maintain"}
          </h2>
          <p className="mt-2 text-mute">
            {rows.length
              ? "Try another filter or search."
              : "Open the website, use OutTrace to check a page, then watch it for changes you can put in a client report. You can also add a watched site below."}
          </p>
          {!rows.length ? (
            <Link className="mt-5 inline-block underline" to="/following">
              Add your first watched site
            </Link>
          ) : null}
        </div>
      )}
      <p className="mt-6 text-[12px] text-mute">
        Scheduled checks run in this browser, not on a server. A quiet inbox
        does not prove that a site is unchanged; check the last capture and
        monitoring status.
      </p>
    </div>
  );
}
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl">{value}</p>
      <p className="mt-1 text-[12px] text-mute">{label}</p>
    </div>
  );
}
