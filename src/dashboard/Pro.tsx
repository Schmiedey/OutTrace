import { BellRing, Check, Clock3, Database, Eye } from "lucide-react";
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
    <h1 className="font-display mt-3 max-w-3xl text-5xl leading-[1.05]">See what changed before it becomes a problem.</h1>
    <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mute">Turn one-off privacy checks into continuous monitoring. Scheduled checks run in your browser and your scan history stays on this device.</p>
    <div className="mt-10 grid gap-4 md:grid-cols-2"><Plan name="Free" price="$0" items={["Unlimited manual page scans", "Full graph and privacy score", "One watched site", "20 scans / 30 days"]} /><Plan name="Pro" price="$8 / month" items={["Unlimited watched sites", "Daily or weekly background checks", "Change alerts and before/after diffs", "15-second deep iframe scanning", "1,000 scans / one year + export"]} highlighted /></div>
    <section className="mt-8 grid gap-5 border-y border-line py-7 sm:grid-cols-2 lg:grid-cols-4">
      <Benefit icon={BellRing} title="Automatic alerts">Know when trackers or connections change.</Benefit>
      <Benefit icon={Eye} title="Deeper visibility">Catch delayed requests and embedded frames.</Benefit>
      <Benefit icon={Clock3} title="Longer history">Build a useful record across a full year.</Benefit>
      <Benefit icon={Database} title="Portable evidence">Export scans for reporting and analysis.</Benefit>
    </section>
    <section className="mt-8 rounded-md border border-line p-5"><p className="text-[14px] font-medium">{status?.paid ? "Pro is active" : status?.configured === false ? "Connect ExtensionPay to enable checkout" : status?.subscriptionStatus === "past_due" ? "Payment needs attention" : "Free plan"}</p><p className="mt-1 text-[12px] text-mute">{status?.sandbox ? "This unpacked build uses ExtensionPay’s development flow and Stripe test cards. Store builds use live checkout." : "Subscription state is verified through ExtensionPay."}</p>{checkoutOpened && !status?.paid ? <p className="mt-3 text-[12px] text-lime">Checkout opened in a new tab. Complete the test payment, return here, then refresh your status.</p> : null}{error || status?.error ? <p className="mt-3 text-[12px] text-rose">{error ?? status?.error}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{!status?.paid ? <Button disabled={Boolean(busy) || status?.configured === false} onClick={() => void run("checkout")}>{busy === "checkout" ? "Opening…" : status?.sandbox ? "Open test checkout" : "Upgrade with Stripe"}</Button> : null}<Button variant="ghost" disabled={Boolean(busy) || status?.configured === false} onClick={() => void run("login")}>{busy === "login" ? "Opening…" : status?.paid ? "Manage subscription" : "Restore purchase"}</Button><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void run("refresh")}>{busy === "refresh" ? "Checking…" : "Refresh status"}</Button></div></section>
  </div>;
}

function Plan({ name, price, items, highlighted = false }: { name: string; price: string; items: string[]; highlighted?: boolean }) {
  return <section className={`rounded-md border p-6 ${highlighted ? "border-ink bg-panel" : "border-line"}`}><p className="text-[13px] text-mute">{name}</p><p className="font-display mt-2 text-3xl">{price}</p><ul className="mt-5 space-y-2 text-[13px] text-mute">{items.map((item) => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item}</li>)}</ul></section>;
}

function Benefit({ icon: Icon, title, children }: { icon: typeof BellRing; title: string; children: string }) {
  return <div><Icon className="h-4 w-4" /><p className="mt-3 text-[13px] font-medium">{title}</p><p className="mt-1 text-[12px] leading-relaxed text-mute">{children}</p></div>;
}
