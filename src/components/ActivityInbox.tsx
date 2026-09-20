import { Link } from "react-router-dom";
import { useAsync } from "@/src/lib/useAsync";
import { activityImportance } from "@/src/analysis/changeImportance";
import { listRecentAlerts, markActivityRead } from "@/src/storage/alerts";
import type { AlertRow } from "@/src/types/graph";

export function ActivityInbox() {
  const activity = useAsync(async () => {
    const [recent, meaningful] = await Promise.all([
      listRecentAlerts(100),
      listRecentAlerts(100, true),
    ]);
    return [
      ...new Map(
        [...recent, ...meaningful].map((alert) => [alert.id, alert]),
      ).values(),
    ].sort((a, b) => b.timestamp - a.timestamp);
  }, []);
  const meaningful = (activity.data ?? []).filter(
    (alert) => activityImportance(alert) !== "routine",
  );
  const routine = (activity.data ?? []).filter(
    (alert) => activityImportance(alert) === "routine",
  );
  const list = (rows: AlertRow[]) => (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((alert) => (
        <li key={alert.id}>
          <Link
            to={
              alert.fromScanId === alert.toScanId
                ? `/graph/${alert.toScanId}`
                : `/diff/${alert.fromScanId}/${alert.toScanId}`
            }
            className="flex items-baseline justify-between gap-4 py-3 hover:bg-raised/80"
            onClick={() => {
              if (alert.id !== undefined)
                void markActivityRead(alert.id)
                  .then(activity.reload)
                  .catch(() => {});
            }}
          >
            <div>
              <p className="text-[10px] tracking-wide text-mute uppercase">
                {activityImportance(alert)}
                {!alert.read ? " · unseen" : ""}
              </p>
              <p className="mt-1 text-[14px] text-ink">{alert.siteDomain}</p>
              <p className="mt-1 text-[12px] text-mute">
                {alert.reasons
                  ?.filter((reason) => reason.importance !== "routine")
                  .map((reason) => reason.label)
                  .join(" · ") ||
                  (alert.addedTrackers.length
                    ? `${alert.addedTrackers.length} new trackers: ${alert.addedTrackers.join(", ")}`
                    : `${alert.addedDomains?.length ?? 0} added · ${alert.removedDomains?.length ?? 0} removed domain references`)}
              </p>
            </div>
            <time
              dateTime={new Date(alert.timestamp).toISOString()}
              className="shrink-0 text-[12px] text-mute"
            >
              {new Date(alert.timestamp).toLocaleDateString()} ·{" "}
              {new Date(alert.timestamp).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="mb-10" aria-label="Activity inbox">
      <h2 className="font-display text-2xl">Changes to review</h2>
      <p className="mt-1 mb-3 text-[12px] text-mute">
        Review new trackers and notable service changes across your sites.
      </p>
      {activity.error ? (
        <p role="alert" className="text-rose">
          {activity.error}
        </p>
      ) : activity.loading ? (
        <p className="text-mute">Opening activity…</p>
      ) : meaningful.length ? (
        list(meaningful)
      ) : (
        <p className="text-[13px] text-mute">
          All quiet. No meaningful changes in recent activity.
        </p>
      )}
      {routine.length ? (
        <details className="mt-4 text-[12px] text-mute">
          <summary className="cursor-pointer">
            {routine.length} routine changes hidden
          </summary>
          <div className="mt-3">{list(routine)}</div>
        </details>
      ) : null}
    </section>
  );
}
