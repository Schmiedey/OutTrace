import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { billingStatus } from "@/src/billing/client";
import { AUDIT_MODES, type AuditMode } from "@/src/audit/types";
import { canonicalAuditUrl } from "@/src/audit/url";
import { FREE_AUDIT_LIMIT_MESSAGE } from "@/src/billing/entitlements";
import { Button } from "@/src/components/ui/button";
import { createAudit } from "@/src/storage/audits";
import { useAsync } from "@/src/lib/useAsync";
import { hasUsedFreeAuditToday, recordUpgradeFriction } from "@/src/storage/settings";
import { useUpgradePrompt } from "@/src/components/UpgradePrompt";
import { noteUsage } from "@/src/telemetry/usage";

export function AuditNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [url, setUrl] = useState(params.get("url") ?? "");
  const [mode, setMode] = useState<AuditMode>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const billing = useAsync(() => billingStatus(), []);
  const freeAudit = useAsync(hasUsedFreeAuditToday, []);
  const openUpgrade = useUpgradePrompt();
  const freeAuditLocked = billing.data?.paid === false && freeAudit.data === true;

  const openAuditUpgrade = (): void => {
    noteUsage("audit-limit-locked-clicked");
    void recordUpgradeFriction("audit-limit");
    openUpgrade();
  };

  useEffect(() => {
    if (url) return;
    void browser.runtime.sendMessage({ type: "GET_AUDIT_TARGET" }).then((response: { target?: { url: string } | null }) => {
      if (response?.target?.url) setUrl(response.target.url);
    }).catch(() => undefined);
  }, [url]);

  const startAudit = async (): Promise<void> => {
    const canonical = canonicalAuditUrl(url, url);
    if (!canonical) {
      setError("Enter a valid http or https website URL.");
      return;
    }
    if (freeAuditLocked) {
      openAuditUpgrade();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const origin = new URL(canonical).origin;
      const origins = mode === "deep" ? ["*://*/*"] : [`${origin}/*`];
      const granted = await browser.permissions.request({ origins });
      if (!granted) throw new Error("Site access is required to crawl this website.");
      const auditId = await createAudit(canonical, mode);
      navigate(`/audits/${String(auditId)}/running`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start audit.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-10 py-10">
      <p className="text-[12px] tracking-[0.14em] text-mute uppercase">New site audit</p>
      <h1 className="font-display mt-2 text-4xl">Audit an entire site</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-mute">LinkScope uses one inactive tab, visits same-origin pages, never submits forms, and stores everything locally.</p>

      <label className="mt-8 block text-[12px] text-mute" htmlFor="audit-url">Website URL</label>
      <input
        id="audit-url"
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://example.com"
        className="mt-2 h-11 w-full rounded-md border border-line bg-canvas px-3 text-[14px] outline-none focus:border-ink"
      />

      <fieldset className="mt-8">
        <legend className="text-[12px] text-mute">Audit depth</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(AUDIT_MODES) as AuditMode[]).map((key) => {
            const item = AUDIT_MODES[key];
            return (
              <label key={key} className={`cursor-pointer rounded-md border px-4 py-4 ${mode === key ? "border-ink bg-raised" : "border-line"}`}>
                <input className="sr-only" type="radio" name="audit-mode" value={key} checked={mode === key} onChange={() => setMode(key)} />
                <span className="block text-[14px] font-medium">{item.label}</span>
                <span className="mt-1 block text-[12px] text-mute">Up to {String(item.maxPages)} pages · {item.waitMs / 1000}s per page</span>
              </label>
            );
          })}
        </div>
        {!billing.data?.paid ? <p className="mt-3 text-[12px] text-mute">{freeAuditLocked ? `${FREE_AUDIT_LIMIT_MESSAGE} Your allowance resets tomorrow.` : "Free includes one site audit per day, including deep iframe-aware mode. Pro unlocks unlimited audits and recurring monitoring."}</p> : null}
      </fieldset>

      {freeAuditLocked ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-panel px-4 py-4">
          <div>
            <p className="text-[13px] font-medium">Keep auditing whenever you need.</p>
            <p className="mt-1 text-[12px] text-mute">Unlock unlimited site audits with a one-time Pro purchase.</p>
          </div>
          <Button variant="ghost" onClick={openAuditUpgrade}>Upgrade to Pro</Button>
        </div>
      ) : null}

      {error ? <p className="mt-5 text-[13px] text-rose">{error}</p> : null}
      <Button className="mt-8" disabled={busy || !url.trim() || billing.loading || freeAudit.loading} onClick={() => void startAudit()}>
        {busy ? "Starting…" : freeAuditLocked ? "Upgrade to Pro" : "Start audit"}
      </Button>
    </div>
  );
}
