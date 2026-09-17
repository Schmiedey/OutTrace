import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ScanProgressBar } from "@/src/components/ScanProgressBar";
import { useScanProgress } from "@/src/components/useScanProgress";
import { DomainIdentityCard } from "@/src/components/DomainIdentity";
import { QuietProtection } from "@/src/components/QuietProtection";
import { ShareScan } from "@/src/components/ShareScan";
import {
  activityImportance,
  classifyChange,
} from "@/src/analysis/changeImportance";
import {
  scoreFromScan,
  scoreSnapshot,
  scoreVerdict,
} from "@/src/analysis/score";
import { groupSnapshotByOwner } from "@/src/analysis/owners";
import { OwnerGroups } from "@/src/components/OwnerGroups";
import {
  getScanTarget,
  openDashboard,
  scanActiveTab,
} from "@/src/extension/scanFlow";
import { registrableDomain } from "@/src/lib/domain";
import { formatRelativeTime } from "@/src/lib/utils";
import { getDomain } from "@/src/storage/domains";
import { isFollowedDomain, toggleFollowDomain } from "@/src/storage/follows";
import { getSiteGlance, type SiteGlance } from "@/src/storage/glance";
import { listRecentAlerts, markAlertsRead } from "@/src/storage/alerts";
import { useAsync } from "@/src/lib/useAsync";
import {
  getSiteMemory,
  unusualForSite,
  type SiteMemory,
} from "@/src/storage/siteMemory";
import { listIgnoredDomains } from "@/src/storage/settings";
import type { DomainRow } from "@/src/types/graph";
import { noteUsage } from "@/src/telemetry/usage";

const POPUP_QUICK_SCAN_TIMEOUT_MS = 25_000;

async function finishWithin<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "The quick scan took too long. Reload the page and try again.",
              ),
            ),
          POPUP_QUICK_SCAN_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function PopupApp() {
  const [host, setHost] = useState("—");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glance, setGlance] = useState<SiteGlance | null>(null);
  const [memory, setMemory] = useState<SiteMemory>();
  const [ignored, setIgnored] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<DomainRow>();
  const [followed, setFollowed] = useState(false);
  const scanProgress = useScanProgress();
  const activity = useAsync(() => listRecentAlerts(100, true), []);
  const elsewhere =
    activity.data?.filter(
      (alert) => !alert.read && alert.siteDomain !== host,
    ) ?? [];

  useEffect(() => {
    noteUsage("product-opened");
    let alive = true;
    void listIgnoredDomains()
      .then((value) => {
        if (alive) setIgnored(value);
      })
      .catch(() => {});
    void (async () => {
      if (typeof browser === "undefined")
        throw new Error(
          "Open LinkScope from the browser toolbar to check a page.",
        );
      const target = await getScanTarget();
      if (!alive) return;
      if (!target) {
        setBlocked("Open a regular website, then check it.");
        return;
      }
      const domain =
        registrableDomain(target.url) ?? new URL(target.url).hostname;
      setHost(domain);
      // Opening the popup is read-only. A scan starts only from the explicit
      // “Check this page” button below.
      const cached = await getSiteGlance(domain);
      if (alive) setGlance(cached);
    })().catch((err: unknown) => {
      if (alive) {
        setError(
          err instanceof Error ? err.message : "Could not load this page.",
        );
        scanProgress.reset();
        setChecking(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [scanProgress.begin, scanProgress.complete, scanProgress.reset]);

  useEffect(() => {
    if (!glance) return;
    let alive = true;
    void getSiteMemory(glance.latest.siteId, glance.latest.timestamp)
      .then((value) => {
        if (alive) setMemory(value);
      })
      .catch(() => {});
    // The change is now visible. Do not acknowledge events newer than this capture.
    if (glance.latest.id !== undefined)
      void markAlertsRead(glance.latest.domain, glance.latest.id).catch(
        () => {},
      );
    return () => {
      alive = false;
    };
  }, [glance?.latest.id, glance?.latest.domain]);

  useEffect(() => {
    let alive = true;
    setSelectedRow(undefined);
    setFollowed(false);
    if (selected)
      void Promise.all([getDomain(selected), isFollowedDomain(selected)])
        .then(([row, tracked]) => {
          if (alive) {
            setSelectedRow(row);
            setFollowed(tracked);
          }
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selected]);

  const score = glance?.latestGraph
    ? scoreSnapshot(glance.latestGraph)
    : undefined;
  const savedScore = glance
    ? (score ?? scoreFromScan(glance.latest))
    : undefined;
  const change = glance?.latestGraph
    ? classifyChange(
        glance.previous,
        glance.latest,
        glance.previousGraph,
        glance.latestGraph,
        { ignoredDomains: ignored, baseline: memory },
      )
    : undefined;
  const meaningful = change && change.importance !== "routine";
  const unseenActivity =
    glance?.activity.filter(
      (alert) => activityImportance(alert) !== "routine",
    ) ?? [];
  const activityReasons = [
    ...new Map(
      unseenActivity
        .flatMap((alert) => alert.reasons ?? [])
        .map((reason) => [reason.code, reason]),
    ).values(),
  ];
  const hasChange = Boolean(meaningful || unseenActivity.length);
  const changeSeverity = unseenActivity.some(
    (alert) => activityImportance(alert) === "important",
  )
    ? "important"
    : change?.importance;
  const unusual = glance
    ? unusualForSite(memory, glance.latest, glance.latestGraph)
    : undefined;
  const owners = glance?.latestGraph
    ? groupSnapshotByOwner(glance.latestGraph).slice(0, 3)
    : [];

  const gradePage = async (): Promise<void> => {
    setChecking(true);
    setError(null);
    try {
      const target = await getScanTarget();
      if (!target) throw new Error("Open a regular website, then check it.");
      const domain =
        registrableDomain(target.url) ?? new URL(target.url).hostname;
      setHost(domain);
      scanProgress.begin();
      await finishWithin(
        scanActiveTab({
          openReport: false,
          tabId: target.id,
          url: target.url,
          notifyIfNew: false,
          force: true,
          extendedHistory: false,
          allFrames: false,
          onProgress: scanProgress.update,
        }),
      );
      scanProgress.complete();
      setGlance(await getSiteGlance(domain));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not check this page.",
      );
      scanProgress.reset();
    } finally {
      setChecking(false);
    }
  };
  const runDeepScan = async (): Promise<void> => {
    setError(null);
    try {
      const granted = await browser.permissions.request({
        origins: ["*://*/*"],
      });
      if (!granted)
        throw new Error("Deep iframe scanning needs access to embedded sites.");
      setChecking(true);
      const result = (await browser.runtime.sendMessage({
        type: "WATCH_ACTIVE_TAB",
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? "Deep scan failed.");
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deep scan failed.");
    } finally {
      setChecking(false);
    }
  };
  const inspect = () => {
    if (glance?.latest.id === undefined) return;
    const event = unseenActivity[0];
    void openDashboard(
      event && event.fromScanId !== event.toScanId
        ? `/diff/${event.fromScanId}/${event.toScanId}`
        : meaningful && glance.previous?.id !== undefined
          ? `/diff/${glance.previous.id}/${glance.latest.id}`
          : `/graph/${glance.latest.id}`,
    );
  };

  return (
    <div className="flex min-h-[320px] w-[360px] flex-col bg-canvas px-4 py-4 text-ink">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
          LinkScope
        </p>
        <p className="text-[11px] text-mute">
          {checking ? (glance ? "Refreshing…" : "Checking…") : "Local-first"}
        </p>
      </div>
      <h1 className="font-display mt-1.5 break-all text-[26px] leading-tight">
        {host}
      </h1>
      {blocked ? (
        <p className="mt-3 text-[12px] text-amber">{blocked}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[12px] text-rose">
          {error}
          {glance ? " Your saved result is still shown." : ""}
        </p>
      ) : null}
      {elsewhere.length ? (
        <section className="mt-3 rounded-md border border-line bg-panel p-3">
          <p className="text-[12px] text-ink">
            {new Set(elsewhere.map((alert) => alert.siteDomain)).size} other
            sites changed
          </p>
          <p className="mt-1 text-[11px] text-mute">
            {[...new Set(elsewhere.map((alert) => alert.siteDomain))]
              .slice(0, 3)
              .join(", ")}
          </p>
          <button
            type="button"
            className="mt-2 text-[12px] underline"
            onClick={() => void openDashboard("/")}
          >
            See activity inbox
          </button>
        </section>
      ) : null}
      {selected ? (
        <div className="mt-4">
          <DomainIdentityCard
            domain={selected}
            row={selectedRow}
            siteCount={glance?.siteCount}
            snapshot={glance?.latestGraph}
            followed={followed}
            onBack={() => setSelected(null)}
            onFollow={() => {
              void toggleFollowDomain(selected).then(setFollowed);
            }}
          />
        </div>
      ) : glance && savedScore ? (
        <div className="mt-3">
          <section className="rounded-md border border-line bg-panel p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[16px] font-medium">
                  {unusual
                    ? "Unusual for this site"
                    : hasChange
                      ? "Changed since last check"
                      : score
                        ? scoreVerdict(score)
                        : "Saved tracking exposure"}
                </p>
                <p className="mt-1 text-[11px] text-mute">
                  Privacy score · higher = less classified tracking
                </p>
              </div>
              <p className="font-display shrink-0 text-4xl">
                {savedScore.score}
                <span className="text-[11px]">/100</span>
              </p>
            </div>
          </section>
          <p className="mt-3 text-[13px]">
            {score?.trackers ?? glance.latest.trackerCount} trackers ·{" "}
            {score?.thirdParties ?? glance.latest.thirdPartyCount} third parties
          </p>
          <p className="mt-2 text-[12px] text-mute">
            {hasChange
              ? `${changeSeverity === "important" ? "Important" : "Notable"} activity on this site`
              : "No important changes"}
          </p>
          {hasChange ? (
            <ul className="mt-2 space-y-1 text-[12px]">
              {(activityReasons.length
                ? activityReasons
                : (change?.reasons ?? [])
              )
                .filter((reason) => reason.importance !== "routine")
                .map((reason) => (
                  <li key={reason.code}>{reason.label}</li>
                ))}
            </ul>
          ) : null}
          {unusual ? (
            <p className="mt-2 text-[12px] text-amber">{unusual}</p>
          ) : null}
          <p className="mt-2 text-[11px] text-mute">
            Checked {formatRelativeTime(glance.latest.timestamp, Date.now())}
            {checking ? " · Refreshing…" : ""}
          </p>
          {score ? (
            <details className="mt-3 text-[12px] text-mute">
              <summary className="cursor-pointer">
                How this score is calculated
              </summary>
              <ul className="mt-2 space-y-1">
                {score.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="mt-2">
                A local heuristic, not a safety guarantee. Unknown does not mean
                safe. Score changes alone never trigger an alert.
              </p>
            </details>
          ) : null}
          {owners.length ? (
            <div className="mt-4 border-t border-line pt-3">
              <OwnerGroups groups={owners} />
            </div>
          ) : null}
        </div>
      ) : checking && scanProgress.progress ? (
        <div className="mt-5">
          <ScanProgressBar progress={scanProgress.progress} />
        </div>
      ) : !blocked ? (
        <p className="mt-4 text-[13px] text-mute">
          No saved capture yet. Click “Check this page” when you want a local
          capture.
        </p>
      ) : null}
      {!selected ? (
        <div className="mt-4 flex flex-col gap-2">
          {glance ? (
            <Button className="w-full" onClick={inspect}>
              {hasChange ? "See what changed" : "See details"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="w-full"
            disabled={checking || Boolean(blocked)}
            onClick={() => void gradePage()}
          >
            ↻ {glance ? "Check again" : "Check this page"}
          </Button>
          <QuietProtection compact suggest={Boolean(glance)} />
          <details className="mt-2 text-[12px] text-mute">
            <summary className="cursor-pointer">More options</summary>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={checking || Boolean(blocked)}
              onClick={() => void runDeepScan()}
            >
              Deep scan · 15 seconds
            </Button>
            {glance?.latest.id !== undefined ? (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => void openDashboard(`/graph/${glance.latest.id}`)}
              >
                Explore graph
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() =>
                void openDashboard(
                  glance ? `/sites/${glance.latest.siteId}` : "/",
                )
              }
            >
              Site history & Watching
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => void openDashboard("/")}
            >
              Activity inbox
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => void openDashboard("/settings")}
            >
              Settings
            </Button>
            {glance?.latestGraph ? (
              <>
                <details className="my-2">
                  <summary className="cursor-pointer">Inspect a domain</summary>
                  <ul className="mt-2 space-y-1">
                    {glance.latestGraph.nodes
                      .filter((node) => !node.isOrigin)
                      .map((node) => (
                        <li key={node.domain}>
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() => setSelected(node.domain)}
                          >
                            {node.domain}
                          </button>
                        </li>
                      ))}
                  </ul>
                </details>
                <ShareScan scan={glance.latest} snapshot={glance.latestGraph} />
              </>
            ) : null}
          </details>
        </div>
      ) : null}
    </div>
  );
}
