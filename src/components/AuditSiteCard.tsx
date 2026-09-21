import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/src/components/ui/button";

type AuditTarget = { domain: string; url: string };

export function AuditSiteCard() {
  const navigate = useNavigate();
  const [auditTarget, setAuditTarget] = useState<AuditTarget | null>();

  useEffect(() => {
    let alive = true;
    const loadAuditTarget = (): void => {
      void browser.runtime
        .sendMessage({ type: "GET_AUDIT_TARGET" })
        .then((response: { ok?: boolean; target?: AuditTarget | null }) => {
          if (alive && response?.ok) setAuditTarget(response.target ?? null);
        })
        .catch(() => {
          if (alive) setAuditTarget(null);
        });
    };
    loadAuditTarget();
    window.addEventListener("focus", loadAuditTarget);
    return () => {
      alive = false;
      window.removeEventListener("focus", loadAuditTarget);
    };
  }, []);

  const openAuditSetup = (): void => {
    if (!auditTarget) return;
    navigate(`/audits/new?url=${encodeURIComponent(auditTarget.url)}`);
  };

  return (
    <section className="rounded-md border border-line bg-panel px-5 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] tracking-[0.14em] text-mute uppercase">Optional site audit</p>
          <h2 className="font-display mt-1 text-2xl">
            {auditTarget === undefined ? "Start a multi-page audit" : auditTarget?.domain ?? "Choose a website"}
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-mute">
            {auditTarget === undefined
              ? "This is separate from a single page check. Use it when you want OutTrace to crawl several pages of a client site."
              : auditTarget
                ? "Crawl the site in one background tab and measure which services appear across its pages."
                : "Open a regular website in another tab, then return here to configure its audit."}
          </p>
        </div>
        <Button className="shrink-0" disabled={!auditTarget} onClick={openAuditSetup}>
          Configure audit
        </Button>
      </div>
    </section>
  );
}
