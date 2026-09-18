import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FREE_AUDIT_LIMIT_MESSAGE } from "@/src/billing/entitlements";
import type { AuditProgress, AuditRow } from "@/src/audit/types";
import { ScanProgressBar } from "@/src/components/ScanProgressBar";
import { Button } from "@/src/components/ui/button";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";
import { auditProgress, getAudit } from "@/src/storage/audits";

export function AuditRunningPage() {
  const auditId = Number(useParams().auditId);
  const navigate = useNavigate();
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const runRequestInFlight = useRef(false);
  const openUpgrade = useUpgradePrompt();

  useEffect(() => {
    if (!Number.isFinite(auditId)) return;
    let alive = true;
    const requestId = globalThis.crypto.randomUUID();
    const refresh = async (): Promise<void> => {
      const [nextAudit, nextProgress] = await Promise.all([getAudit(auditId), auditProgress(auditId)]);
      if (!alive || !nextAudit) return;
      setAudit(nextAudit);
      setProgress(nextProgress);
      if (nextAudit.status === "completed") navigate(`/audits/${String(auditId)}`, { replace: true });
      if (nextAudit.status === "failed") setError(nextAudit.error ?? "Audit failed.");
      if (nextAudit.status !== "failed") setError(null);
    };
    const listener = (message: unknown): undefined => {
      const event = message as { type?: string; requestId?: string; progress?: AuditProgress };
      if (event.type !== "AUDIT_PROGRESS" || event.requestId !== requestId || !event.progress) return undefined;
      setProgress(event.progress);
      setRecent(event.progress.recentlyFound);
      return undefined;
    };
    browser.runtime.onMessage.addListener(listener);
    const ensureRunning = async (): Promise<void> => {
      if (!alive || runRequestInFlight.current) return;
      const current = await getAudit(auditId);
      if (!alive || !current || current.status === "completed" || current.status === "cancelled") return;
      runRequestInFlight.current = true;
      try {
        const response = (await browser.runtime.sendMessage({ type: "RUN_SITE_AUDIT", auditId, requestId })) as { ok?: boolean; error?: string };
        if (!alive) return;
        if (!response?.ok) setError(response?.error ?? "Audit failed.");
        await refresh();
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : "Audit failed.");
      } finally {
        runRequestInFlight.current = false;
      }
    };
    void refresh().then(() => ensureRunning()).catch((err: unknown) => {
      if (alive) setError(err instanceof Error ? err.message : "Audit failed.");
    });
    // Keep a stalled page recoverable when Chrome restarts the MV3 worker. A
    // duplicate request is safe because the background deduplicates by audit id.
    const timer = window.setInterval(() => {
      void refresh();
      void ensureRunning();
    }, 1_500);
    return () => {
      alive = false;
      window.clearInterval(timer);
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [auditId, navigate]);

  const total = Math.min(audit?.maxPages ?? 1, Math.max(1, progress?.pagesDiscovered ?? 1));
  const finished = (progress?.pagesScanned ?? 0) + (progress?.pagesFailed ?? 0);
  const percent = Math.min(99, Math.round((finished / total) * 100));
  const currentPath = useMemo(() => {
    try { return progress?.currentUrl ? new URL(progress.currentUrl).pathname || "/" : "Discovering pages…"; }
    catch { return progress?.currentUrl ?? "Discovering pages…"; }
  }, [progress?.currentUrl]);

  const stop = async (): Promise<void> => {
    await browser.runtime.sendMessage({ type: "CANCEL_SITE_AUDIT", auditId });
    navigate("/audits");
  };

  return (
    <div className="mx-auto max-w-3xl px-10 py-12">
      <p className="text-[12px] tracking-[0.14em] text-mute uppercase">Site audit</p>
      <h1 className="font-display mt-2 break-all text-4xl">{audit?.domain ?? "Preparing audit…"}</h1>
      <div className="mt-10 rounded-md border border-line bg-panel px-6 py-6">
        <ScanProgressBar progress={{ phase: "observing", percent, label: `${String(finished)} / ${String(total)} pages` }} />
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[11px] text-mute uppercase">Currently checking</p>
          <p className="mt-1 truncate font-mono text-[13px] text-ink">{currentPath}</p>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Metric label="Discovered" value={progress?.pagesDiscovered} />
          <Metric label="Checked" value={progress?.pagesScanned} />
          <Metric label="Third parties" value={progress?.thirdPartyCount} />
          <Metric label="Trackers" value={progress?.trackerCount} />
          <Metric label="Unknown" value={progress?.unknownCount} />
          <Metric label="Failed pages" value={progress?.pagesFailed} />
        </dl>
        {recent.length > 0 ? (
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-[11px] text-mute uppercase">Recently found</p>
            <ul className="mt-2 space-y-1 font-mono text-[12px]">{recent.map((domain) => <li key={domain}>+ {domain}</li>)}</ul>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-rose">{error}</p>
          {error === FREE_AUDIT_LIMIT_MESSAGE ? <Button variant="ghost" onClick={openUpgrade}>Upgrade to Pro</Button> : null}
        </div>
      ) : null}
      <Button variant="ghost" className="mt-6" onClick={() => void stop()}>Stop audit</Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return <div><dt className="text-[11px] text-mute">{label}</dt><dd className="font-display mt-1 text-2xl">{value ?? "—"}</dd></div>;
}
