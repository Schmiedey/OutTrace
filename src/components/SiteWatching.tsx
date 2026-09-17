import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "@/src/lib/useAsync";
import { Button } from "@/src/components/ui/button";
import { db } from "@/src/storage/database";
import { billingStatus } from "@/src/billing/client";
import { cn } from "@/src/lib/utils";

export function SiteWatching({
  domain,
  url,
  className,
}: {
  domain: string;
  url: string;
  className?: string;
}) {
  const state = useAsync(async () => {
    const [site, billing] = await Promise.all([
      db.watchedSites.get(domain),
      billingStatus(),
    ]);
    return { site, billing };
  }, [domain]);
  const [explain, setExplain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const granted = await browser.permissions.request({
        origins: ["*://*/*"],
      });
      if (!granted)
        throw new Error(
          "Watching needs optional site access. Manual checks still work.",
        );
      const result = (await browser.runtime.sendMessage({
        type: "ADD_WATCHED_SITE",
        url,
        schedule: "visit",
      })) as { ok?: boolean; error?: string };
      if (!result?.ok)
        throw new Error(result?.error ?? "Could not enable Watching.");
      state.reload();
      setExplain(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not enable Watching.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={cn(
        "mt-6 rounded-md border border-line bg-panel p-4",
        className,
      )}
      aria-label="Site Watching"
    >
      <h2 className="text-[15px] font-medium">Watching</h2>
      <p className="mt-2 text-[13px] text-mute">
        {state.data?.site?.enabled
          ? `Watching · ${state.data.site.schedule === "visit" ? "when you visit" : state.data.site.schedule}`
          : "Not watching"}
        . Quiet Protection is separate from explicit Watching.
      </p>
      {state.data?.site?.enabled ? (
        <Link
          to="/following"
          className="mt-3 inline-block text-[13px] underline"
        >
          Change check frequency and alerts
        </Link>
      ) : state.data?.billing.paid ? (
        <Button
          variant="ghost"
          className="mt-3"
          disabled={busy}
          onClick={() => setExplain(true)}
        >
          Watch this site
        </Button>
      ) : (
        <Link to="/pro" className="mt-3 inline-block text-[13px] underline">
          Watch this site · Pro
        </Link>
      )}
      {explain ? (
        <div className="mt-3 text-[12px] text-mute">
          <p>
            Check this site when you visit, after a 6-second dwell and at most
            twice per day. Scan contents stay local. Daily/weekly scheduling is
            optional and may briefly load a site in an inactive tab.
            Notifications stay off unless enabled in Settings.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void enable()}>
              Enable Watching
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setExplain(false)}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-rose">
          {error}
        </p>
      ) : null}
    </section>
  );
}
