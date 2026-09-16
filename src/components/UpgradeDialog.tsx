import { BellRing, Check, Clock3, Database, Eye, ShieldCheck, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { BillingStatus } from "@/src/billing/extpay";
import { billingStatus, launchCheckout, launchLogin } from "@/src/billing/client";
import { Button } from "@/src/components/ui/button";

const BENEFITS = [
  {
    icon: BellRing,
    title: "Know when a site changes",
    description: "Run daily or weekly checks and get useful alerts when trackers or connections change.",
  },
  {
    icon: Eye,
    title: "Catch what quick scans miss",
    description: "Watch requests for 15 seconds and inspect embedded, cross-origin frames.",
  },
  {
    icon: Clock3,
    title: "Keep a longer paper trail",
    description: "Compare up to 1,000 scans across one year instead of 20 scans across 30 days.",
  },
  {
    icon: Database,
    title: "Watch and export without limits",
    description: "Monitor unlimited sites and export your scans for reporting or deeper analysis.",
  },
] as const;

type UpgradeDialogProps = {
  open: boolean;
  status: BillingStatus | undefined;
  onClose: () => void;
  onStatusChange: (status: BillingStatus) => void;
};

export function UpgradeDialog({ open, status, onClose, onStatusChange }: UpgradeDialogProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<"checkout" | "login" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingOpened, setBillingOpened] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !billingOpened) return;
    const refreshOnReturn = (): void => {
      if (document.visibilityState !== "visible") return;
      void billingStatus(true).then(onStatusChange).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [billingOpened, onStatusChange, open]);

  if (!open) return null;

  const run = async (action: "checkout" | "login"): Promise<void> => {
    setBusy(action);
    setError(null);
    try {
      if (action === "checkout") {
        await launchCheckout();
      } else {
        await launchLogin();
      }
      setBillingOpened(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open billing.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-5 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        role="dialog"
        className="relative max-h-[calc(100vh-2.5rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-canvas shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close upgrade dialog"
          className="absolute top-4 right-4 rounded-md p-2 text-mute transition-colors hover:bg-raised hover:text-ink"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid md:grid-cols-[1fr_250px]">
          <div className="p-7 md:p-9">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] uppercase">
              <ShieldCheck className="h-3.5 w-3.5" /> LinkScope Pro
            </div>
            <h2 id={titleId} className="font-display mt-4 max-w-lg text-4xl leading-[1.05]">
              See what changed before it becomes a problem.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-mute">
              Turn one-off privacy checks into continuous monitoring—without sending your scan history to a cloud dashboard.
            </p>

            <div className="mt-7 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {BENEFITS.map((benefit) => (
                <div key={benefit.title} className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised">
                    <benefit.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">{benefit.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-mute">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="flex flex-col border-t border-line bg-panel p-7 md:border-t-0 md:border-l">
            <p className="text-[11px] tracking-[0.12em] text-mute uppercase">One simple plan</p>
            <p className="font-display mt-2 text-4xl">$8</p>
            <p className="text-[12px] text-mute">per month</p>
            <ul className="mt-6 space-y-2.5 text-[12px]">
              {["Unlimited watched sites", "Daily or weekly checks", "Change alerts and diffs", "Deep scans", "One-year history + export"].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 md:mt-auto md:pt-8">
              <Button
                className="w-full"
                disabled={Boolean(busy) || status?.configured === false}
                onClick={() => void run("checkout")}
              >
                {busy === "checkout" ? "Opening secure checkout…" : status?.sandbox ? "Upgrade with test checkout" : "Upgrade to Pro"}
              </Button>
              <button
                type="button"
                className="mt-3 w-full text-center text-[12px] text-mute underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
                disabled={Boolean(busy) || status?.configured === false}
                onClick={() => void run("login")}
              >
                {busy === "login" ? "Opening…" : "Already paid? Restore purchase"}
              </button>
              <p className="mt-5 text-center text-[10px] leading-relaxed text-mute">
                Payment is handled by Stripe through ExtensionPay. Scan data stays on this device.
              </p>
              {billingOpened ? <p className="mt-3 text-center text-[11px] text-lime">Billing opened in a new tab.</p> : null}
              {error || status?.error ? <p className="mt-3 text-center text-[11px] text-rose">{error ?? status?.error}</p> : null}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
