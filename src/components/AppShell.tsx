import { ClipboardCheck, Crown, Globe2, History, LayoutDashboard, Network, Settings, Star, Waypoints } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  { to: "/pro", label: "Pro", icon: Crown },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const location = useLocation();
  const unread = useAsync(() => unreadAlertCount(), [location.pathname]);

  useEffect(() => {
    if (location.pathname !== "/") return;
    void markAlertsRead().then(() => unread.reload());
    // Reload is stable enough for a pathname-only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line">
        <div className="px-5 py-5">
          <p className="font-display text-xl">LinkScope</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
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
        <p className="px-5 py-4 text-[12px] leading-relaxed text-mute">
          Scan data stays on this device.
        </p>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
