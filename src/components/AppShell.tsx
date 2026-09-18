import { ArrowUpRight, ClipboardCheck, Crown, Globe2, History, LayoutDashboard, Network, Settings, Star, Waypoints } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { billingStatus } from "@/src/billing/client";
import type { BillingStatus } from "@/src/billing/extpay";
import { UpgradeDialog } from "@/src/components/UpgradeDialog";
import { UpgradePromptContext } from "@/src/components/UpgradePrompt";
import { cn } from "@/src/lib/utils";
import { useAsync } from "@/src/lib/useAsync";
import { markAlertsRead, unreadAlertCount } from "@/src/storage/alerts";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/scans", label: "Scans", icon: History },
  { to: "/audits", label: "Audits", icon: ClipboardCheck },
  { to: "/sites", label: "Sites", icon: Globe2 },
  { to: "/domains", label: "Domains", icon: Waypoints },
  { to: "/following", label: "Watching", icon: Star },
  { to: "/global", label: "Global graph", icon: Network },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const location = useLocation();
  const unread = useAsync(() => unreadAlertCount(), [location.pathname]);
  const billing = useAsync(() => billingStatus(), [location.pathname]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [refreshedStatus, setRefreshedStatus] = useState<BillingStatus | undefined>();
  const status = refreshedStatus ?? billing.data;
  const closeUpgrade = useCallback(() => setUpgradeOpen(false), []);
  const updateStatus = useCallback((next: BillingStatus) => {
    setRefreshedStatus(next);
    if (next.paid) setUpgradeOpen(false);
  }, []);

  useEffect(() => {
    if (location.pathname !== "/") return;
    void markAlertsRead().then(() => unread.reload());
    // Reload is stable enough for a pathname-only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line">
        <div className="px-5 py-5">
          <p className="font-display text-xl">LinkScope</p>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-[13px]",
                  isActive ? "bg-raised text-ink" : "text-mute hover:text-ink",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/" && (unread.data ?? 0) > 0 ? (
                <span className="text-[11px] tabular-nums text-rose">{unread.data}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="p-2">
          {status?.paid ? (
            <NavLink
              to="/pro"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-[12px] text-mute hover:bg-raised hover:text-ink"
            >
              <Crown className="h-4 w-4" />
              <span className="flex-1">Pro plan</span>
              <span className="rounded-full bg-raised px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-ink uppercase">Active</span>
            </NavLink>
          ) : (
            <button
              type="button"
              className="group w-full rounded-lg bg-ink px-3.5 py-3 text-left text-canvas shadow-sm transition-transform hover:-translate-y-0.5"
              onClick={() => setUpgradeOpen(true)}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                <Crown className="h-4 w-4" />
                Upgrade to Pro
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <span className="mt-1 block pl-6 text-[10px] text-canvas/65">One-time $14.99 · recurring monitoring</span>
            </button>
          )}
          <p className="px-3 pt-3 pb-2 text-[10px] leading-relaxed text-mute">Scan data stays on this device.</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <UpgradePromptContext.Provider value={() => setUpgradeOpen(true)}>
          <Outlet />
        </UpgradePromptContext.Provider>
      </main>
      <UpgradeDialog open={upgradeOpen} status={status} onClose={closeUpgrade} onStatusChange={updateStatus} />
    </div>
  );
}
