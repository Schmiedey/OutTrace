import { useEffect, useState } from "react";
import { useAsync } from "@/src/lib/useAsync";
import {
  automaticProtectionEnabled,
  protectionPromptState,
  setAutomaticProtectionEnabled,
  setProtectionPromptState,
} from "@/src/storage/settings";
import { Button } from "@/src/components/ui/button";

export function QuietProtection({
  compact = false,
  suggest = false,
}: {
  compact?: boolean;
  suggest?: boolean;
}) {
  const state = useAsync(
    async () => ({
      enabled: await automaticProtectionEnabled(),
      prompt: await protectionPromptState(),
    }),
    [],
  );
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = state.data?.enabled ?? false;
  useEffect(() => {
    if (typeof browser === "undefined") return;
    const listener = (message: { type?: string }) => {
      if (message?.type === "PROTECTION_UPDATED") state.reload();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [state.reload]);
  const visible =
    show ||
    (suggest && !dismissed && !enabled && state.data?.prompt === "never-seen");
  const updateBackground = async () => {
    if (typeof browser !== "undefined")
      await browser.runtime
        .sendMessage({ type: "PROTECTION_UPDATED" })
        .catch(() => {});
  };
  const disable = async () => {
    await setAutomaticProtectionEnabled(false);
    state.reload();
    await updateBackground();
  };
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const granted = await browser.permissions.request({
        origins: ["*://*/*"],
      });
      if (!granted) {
        setError("Permission was not granted. Manual checks still work.");
        return;
      }
      await setAutomaticProtectionEnabled(true);
      await setProtectionPromptState("enabled");
      setShow(false);
      state.reload();
      await updateBackground();
    } catch {
      setError("Could not enable Quiet Protection. Manual checks still work.");
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    await setProtectionPromptState("dismissed");
    setShow(false);
    setDismissed(true);
    state.reload();
  };
  return (
    <section
      aria-label="Quiet Protection"
      className={compact ? "mt-3 text-[11px] text-mute" : "my-4"}
    >
      <button
        type="button"
        disabled={busy || state.loading}
        className="text-mute hover:text-ink"
        onClick={() => {
          if (enabled)
            void disable().catch(() =>
              setError("Could not disable protection."),
            );
          else setShow(true);
        }}
      >
        {enabled
          ? "Protection on · turn off"
          : compact
            ? "Protection off"
            : "Turn on Quiet Protection"}
      </button>
      {visible ? (
        <div className="mt-3 rounded-md border border-line bg-panel p-4">
          <h2 className="text-[15px] font-medium text-ink">Quiet Protection</h2>
          <p className="mt-2 text-[12px]">
            LinkScope can quietly re-check sites you visit and only surface
            meaningful changes.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px]">
            <li>No popups</li>
            <li>Scan contents stay local</li>
            <li>At most 2 checks per site per day</li>
            <li>Turn it off anytime</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void enable()}>
              {busy ? "Enabling…" : "Enable Quiet Protection"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void dismiss().catch(() =>
                  setError("Could not save preference."),
                )
              }
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
