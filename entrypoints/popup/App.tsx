import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ScanProgressBar } from "@/src/components/ScanProgressBar";
import { useScanProgress } from "@/src/components/useScanProgress";
import { DomainIdentityCard } from "@/src/components/DomainIdentity";
import { NutritionLabel } from "@/src/components/NutritionLabel";
import { diffSnapshots } from "@/src/analysis/diff";
import { identifyDomain } from "@/src/analysis/identity";
import { countsSentence, nutritionFromScan } from "@/src/analysis/nutrition";
import { getScanTarget, openDashboard } from "@/src/extension/scanFlow";
import { registrableDomain } from "@/src/lib/domain";
import { formatRelativeTime } from "@/src/lib/utils";
import { getDomain } from "@/src/storage/domains";
import { isFollowedDomain, toggleFollowDomain } from "@/src/storage/follows";
import { getSiteGlance, type SiteGlance } from "@/src/storage/glance";
import type { DomainRow } from "@/src/types/graph";
import { billingStatus } from "@/src/billing/client";
import { useAsync } from "@/src/lib/useAsync";

export function PopupApp() {
  const [host, setHost] = useState("—");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glance, setGlance] = useState<SiteGlance | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<DomainRow | undefined>(undefined);
  const [followed, setFollowed] = useState(false);
  const scanProgress = useScanProgress();
  const billing = useAsync(() => billingStatus(), []);
  const now = Date.now();

  const load = async (domain: string): Promise<SiteGlance | null> => {
    const next = await getSiteGlance(domain);
    setGlance(next);
    return next;
  };

  useEffect(() => {
    if (typeof browser === "undefined" || !browser.tabs?.query) {
      setBlocked("Open LinkScope from the Chrome toolbar to check a page.");
      return;
    }
    let alive = true;
    void (async () => {
      const target = await getScanTarget();
      if (!alive) return;
      if (!target) {
        setBlocked("Open a regular website, then check it.");
        return;
      }
      setBlocked(null);
      const domain = registrableDomain(target.url) ?? new URL(target.url).hostname;
      setHost(domain);
      setChecking(true);
      setError(null);
      const requestId = scanProgress.begin();
      try {
        const result = (await browser.runtime.sendMessage({
          type: "SCAN_QUIET",
          tabId: target.id,
          url: target.url,
          requestId,
        })) as { ok?: boolean; error?: string };
        if (!result?.ok) throw new Error(result?.error ?? "Check failed.");
        if (alive) {
          scanProgress.complete();
          await load(domain);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Check failed.");
          scanProgress.reset();
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [scanProgress.begin, scanProgress.complete, scanProgress.reset]);

  useEffect(() => {
    if (!selected) return;
    void getDomain(selected).then(setSelectedRow);
    void isFollowedDomain(selected).then(setFollowed);
  }, [selected]);

  const nutrition = glance ? nutritionFromScan(glance.latest, glance.latestGraph) : null;
  const diff =
    glance?.latest && glance.previous && glance.latestGraph && glance.previousGraph
      ? diffSnapshots(glance.previous, glance.latest, glance.previousGraph, glance.latestGraph)
      : undefined;

  const inspect = (): void => {
    const scanId = glance?.latest.id;
    if (scanId !== undefined) {
      void openDashboard(`/graph/${String(scanId)}`);
      return;
    }
    void openDashboard(glance?.site.id !== undefined ? `/sites/${String(glance.site.id)}` : "/");
  };

  const runWatch = async (): Promise<void> => {
    if (!billing.data?.paid) {
      await openDashboard("/pro");
      window.close();
      return;
    }
    const granted = await browser.permissions.request({ origins: ["*://*/*"] });
    if (!granted) {
      setError("Deep iframe scanning needs access to embedded sites.");
      return;
    }
    scanProgress.reset();
    setChecking(true);
    setError(null);
    try {
      const result = (await browser.runtime.sendMessage({ type: "WATCH_ACTIVE_TAB" })) as {
        ok?: boolean;
        error?: string;
      };
      if (!result?.ok) throw new Error(result?.error ?? "Watch failed.");
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Watch failed.");
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-[320px] w-[360px] flex-col bg-canvas px-4 py-4 text-ink">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] tracking-[0.14em] text-mute uppercase">LinkScope</p>
        {checking ? <p className="text-[11px] text-mute">Auditing live</p> : null}
      </div>
      <h1 className="font-display mt-1.5 break-all text-[26px] leading-tight">{host}</h1>

      {blocked ? <p className="mt-3 text-[12px] text-amber">{blocked}</p> : null}
      {error ? <p className="mt-3 text-[12px] text-rose">{error}</p> : null}

      {checking && scanProgress.progress ? (
        <section className="mt-5 rounded-md border border-line bg-panel px-3.5 py-3.5">
          <ScanProgressBar progress={scanProgress.progress} />
          <p className="mt-2 text-[11px] leading-relaxed text-mute">
            Keep this popup open while LinkScope maps the page.
          </p>
        </section>
      ) : selected ? (
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
      ) : nutrition ? (
        <div className="mt-3">
          <p className="text-[15px] font-medium text-ink">{countsSentence(nutrition.counts)}</p>
          <div className="mt-3">
            <NutritionLabel nutrition={nutrition} compact />
          </div>

          {diff && glance?.previous ? (
            <section className="mt-4">
              <p className="text-[12px] text-mute">
                Changes since {formatRelativeTime(diff.from.timestamp, now)}
                {diff.added.length > 0 ? ` · +${String(diff.added.length)} domains` : ""}
              </p>
              {diff.added.length === 0 && diff.removed.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-mute">No domains added or removed.</p>
              ) : null}
              {diff.added.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {diff.added.slice(0, 6).map((node) => (
                    <li key={node.domain}>
                      <button
                        type="button"
                        className="text-left text-[12px] text-ink hover:underline"
                        onClick={() => setSelected(node.domain)}
                      >
                        + {node.domain}
                      </button>
                      <span className="text-[11px] text-mute"> · {identifyDomain(node.domain).name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {diff.removed.slice(0, 4).map((node) => (
                <p key={node.domain} className="text-[12px] text-mute">
                  − {node.domain}
                </p>
              ))}
            </section>
          ) : glance?.latest ? (
            <p className="mt-3 text-[12px] text-mute">
              Last seen {formatRelativeTime(glance.latest.timestamp, now)} · first check
            </p>
          ) : null}
        </div>
      ) : !blocked ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mute">
          {checking ? "Reading this page…" : "Click the icon on a website to check who else is on it."}
        </p>
      ) : null}

      {!selected ? (
        <div className="mt-4 flex flex-col gap-2">
          <Button className="w-full" disabled={checking || Boolean(blocked)} onClick={inspect}>
            Inspect
          </Button>
          <Button variant="ghost" className="w-full" disabled={checking || Boolean(blocked)} onClick={() => void runWatch()}>
            {billing.data?.paid ? "Deep scan · 15 seconds" : "Deep scan · Pro"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() =>
              void openDashboard(glance?.site.id !== undefined ? `/sites/${String(glance.site.id)}` : "/")
            }
          >
            Full report
          </Button>
        </div>
      ) : null}
    </div>
  );
}
