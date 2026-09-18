import { BellRing, Check, CheckCircle2, Clock3, Database, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { billingStatus, launchCheckout, launchLogin } from "@/src/billing/client";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { useAsync } from "@/src/lib/useAsync";

export function ProPage() {
  const location = useLocation();
  const billing = useAsync(() => billingStatus(true), []);
  const [busy, setBusy] = useState<"checkout" | "login" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  const paymentConfirmed = new URLSearchParams(location.search).get("billing") === "success";
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const status = billing.data;
  const run = async (action: "checkout" | "login" | "refresh"): Promise<void> => {
    setBusy(action); setError(null);
    try {
      if (action === "checkout") {
        await launchCheckout();
        setCheckoutOpened(true);
      } else if (action === "login") {
        await launchLogin();
      } else await billingStatus(true);
      billing.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open billing."); }
    finally { setBusy(null); }
  };
  useEffect(() => {
    if (!checkoutOpened) return;
    const refreshOnReturn = (): void => {
      if (document.visibilityState !== "visible") return;
      void billingStatus(true).then(() => billing.reload()).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [checkoutOpened]);
  useEffect(() => {
    if (!paymentConfirmed || status?.paid !== true) {
      setShowPaymentSuccess(false);
      return;
    }
    setShowPaymentSuccess(true);
    const timeout = window.setTimeout(() => setShowPaymentSuccess(false), 6000);
    return () => window.clearTimeout(timeout);
  }, [paymentConfirmed, billing.data?.paid]);
  const proActive = status?.paid === true;
  return <div className="mx-auto max-w-4xl px-10 py-10">
    <div className="flex items-center gap-3"><p className="text-[12px] tracking-[0.14em] text-mute uppercase">LinkScope Pro</p>{status?.sandbox ? <span className="rounded-full border border-amber px-2 py-0.5 text-[10px] text-amber">Stripe sandbox</span> : null}</div>
    {showPaymentSuccess ? <div role="status" aria-live="polite" className="billing-success mt-6 flex max-w-xl items-center gap-3 rounded-md border border-lime/30 bg-panel px-4 py-3"><span className="billing-success-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-lime/30 text-lime"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-[13px] font-medium">Pro is unlocked</p><p className="mt-0.5 text-[12px] text-mute">Payment confirmed. Unlimited access is ready.</p></div></div> : null}
    <h1 className="font-display mt-3 max-w-3xl text-5xl leading-[1.05]">Keep watch without keeping tabs.</h1>
    <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mute">Manual scans, graphs, scores, and single-scan exports stay free. Free includes one site audit per day; Pro adds unlimited audits, ongoing monitoring, and multi-site reporting.</p>
    <div className="mt-10 grid gap-4 md:grid-cols-2"><Plan name="Free" price="$0" items={["Unlimited manual scans", "One site audit per day", "Score, explanation, and full graph", "Branded share cards + single-scan export", "Saved scans and complete local backups"]} /><Plan name="Pro" price="$14.99 once" items={["One-time payment — access remains active", "Unlimited site audits, including deep audits", "Unlimited watched sites", "Daily or weekly background checks", "Native digests, change alerts, and multi-site reporting"]} highlighted /></div>
    <section className="mt-8 grid gap-5 border-y border-line py-7 sm:grid-cols-2 lg:grid-cols-4">
      <Benefit icon={BellRing} title="Automatic alerts">Know when trackers or connections change.</Benefit>
      <Benefit icon={Eye} title="Deeper visibility">Catch delayed requests and embedded frames.</Benefit>
      <Benefit icon={Clock3} title="Ongoing checks">Keep an eye on sites without re-running checks yourself.</Benefit>
      <Benefit icon={Database} title="Portable evidence">Export scans for reporting and analysis.</Benefit>
    </section>
    <section className="mt-8 rounded-md border border-line p-5"><p className="text-[14px] font-medium">{proActive ? "Pro active" : status?.configured === false ? "Connect ExtensionPay to enable checkout" : "Free plan"}</p><p className="mt-1 text-[12px] text-mute">{status?.sandbox ? "This unpacked build uses ExtensionPay’s development flow and Stripe test cards. Use ExtensionPay’s reset control to switch the test user between paid and unpaid." : "LinkScope has no account. ExtensionPay and Stripe handle payment email/card details and Pro verification."}</p>{checkoutOpened && !proActive ? <p className="mt-3 text-[12px] text-lime">Checkout opened. LinkScope will return you to the Pro page after payment.</p> : null}{error || status?.error ? <p className="mt-3 text-[12px] text-rose">{error ?? status?.error}</p> : null}<div className="mt-4 flex flex-wrap items-center gap-2">{proActive ? <Badge tone="lime" className="font-medium">Pro active</Badge> : <Button className="whitespace-nowrap" disabled={Boolean(busy) || status?.configured === false} onClick={() => void run("checkout")}>{busy === "checkout" ? "Opening…" : "Upgrade to Pro"}</Button>}<Button variant="ghost" disabled={Boolean(busy) || status?.configured === false} onClick={() => void run("login")}>{busy === "login" ? "Opening…" : "Restore purchase"}</Button><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void run("refresh")}>{busy === "refresh" ? "Checking…" : "Refresh status"}</Button></div></section>
  </div>;
}

function Plan({ name, price, items, highlighted = false }: { name: string; price: string; items: string[]; highlighted?: boolean }) {
  return <section className={`rounded-md border p-6 ${highlighted ? "border-ink bg-panel" : "border-line"}`}><p className="text-[13px] text-mute">{name}</p><p className="font-display mt-2 text-3xl">{price}</p><ul className="mt-5 space-y-2 text-[13px] text-mute">{items.map((item) => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item}</li>)}</ul></section>;
}

function Benefit({ icon: Icon, title, children }: { icon: typeof BellRing; title: string; children: string }) {
  return <div><Icon className="h-4 w-4" /><p className="mt-3 text-[13px] font-medium">{title}</p><p className="mt-1 text-[12px] leading-relaxed text-mute">{children}</p></div>;
}
