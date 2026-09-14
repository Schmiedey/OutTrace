import { useState } from "react";
import { billingStatus, launchCheckout, launchLogin } from "@/src/billing/client";
import { Button } from "@/src/components/ui/button";
import { useAsync } from "@/src/lib/useAsync";

export function ProPage() {
  const billing = useAsync(() => billingStatus(), []);
  const [busy, setBusy] = useState<"checkout" | "login" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  const run = async (action: "checkout" | "login" | "refresh"): Promise<void> => {
    setBusy(action); setError(null);
    try {
      if (action === "checkout") {
        await launchCheckout();
        setCheckoutOpened(true);
      } else if (action === "login") await launchLogin(); else await billingStatus(true);
      billing.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open billing."); }
    finally { setBusy(null); }
  };
  const status = billing.data;
  return <div className="mx-auto max-w-4xl px-10 py-10">
    <div className="flex items-center gap-3"><p className="text-[12px] tracking-[0.14em] text-mute uppercase">LinkScope Pro</p>{status?.sandbox ? <span className="rounded-full border border-amber px-2 py-0.5 text-[10px] text-amber">Stripe sandbox</span> : null}</div>
    <h1 className="font-display mt-3 text-5xl">Keep watch, even when you’re away.</h1>
    <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mute">Scheduled checks run in your own browser. Your scan data stays on this device; ExtensionPay handles account and payment status.</p>
    <div className="mt-10 grid gap-4 md:grid-cols-2"><Plan name="Free" price="$0" items={["Unlimited manual page scans", "Full graph and privacy score", "One watched site", "20 scans / 30 days"]} /><Plan name="Pro" price="$8 / month" items={["Unlimited watched sites", "Daily or weekly background checks", "Change alerts and diffs", "Deep iframe scanning", "1,000 scans / one year + export"]} highlighted /></div>
    <section className="mt-8 rounded-md border border-line p-5"><p className="text-[14px] font-medium">{status?.paid ? "Pro is active" : status?.configured === false ? "Connect ExtensionPay to enable checkout" : status?.subscriptionStatus === "past_due" ? "Payment needs attention" : "Free plan"}</p><p className="mt-1 text-[12px] text-mute">{status?.sandbox ? "This unpacked build uses ExtensionPay’s development flow and Stripe test cards. Store builds use live checkout." : "Subscription state is verified through ExtensionPay."}</p>{checkoutOpened && !status?.paid ? <p className="mt-3 text-[12px] text-lime">Checkout opened in a new tab. Complete the test payment, return here, then refresh your status.</p> : null}{error || status?.error ? <p className="mt-3 text-[12px] text-rose">{error ?? status?.error}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{!status?.paid ? <Button disabled={Boolean(busy) || status?.configured === false} onClick={() => void run("checkout")}>{busy === "checkout" ? "Opening…" : status?.sandbox ? "Open test checkout" : "Upgrade with Stripe"}</Button> : null}<Button variant="ghost" disabled={Boolean(busy) || status?.configured === false} onClick={() => void run("login")}>{busy === "login" ? "Opening…" : status?.paid ? "Manage subscription" : "Restore purchase"}</Button><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void run("refresh")}>{busy === "refresh" ? "Checking…" : "Refresh status"}</Button></div></section>
  </div>;
}

function Plan({ name, price, items, highlighted = false }: { name: string; price: string; items: string[]; highlighted?: boolean }) {
  return <section className={`rounded-md border p-6 ${highlighted ? "border-ink bg-panel" : "border-line"}`}><p className="text-[13px] text-mute">{name}</p><p className="font-display mt-2 text-3xl">{price}</p><ul className="mt-5 space-y-2 text-[13px] text-mute">{items.map((item) => <li key={item}>✓ {item}</li>)}</ul></section>;
}
