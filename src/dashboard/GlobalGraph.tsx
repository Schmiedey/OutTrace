import { useState } from "react";
import { Link } from "react-router-dom";
import { GraphViewer } from "@/src/graph/GraphViewer";
import { useAsync } from "@/src/lib/useAsync";
import { getGlobalSnapshot } from "@/src/storage/scans";

export function GlobalGraphPage() {
  const [minSeenOn, setMinSeenOn] = useState(1);

  const snapshot = useAsync(
    () => getGlobalSnapshot({ minSeenOn, types: "all", maxNodes: 2000 }),
    [minSeenOn],
  );

  if (snapshot.loading && !snapshot.data) {
    return <GlobalGraphShell message="Assembling global graph…" />;
  }

  if (snapshot.error) {
    return (
      <GlobalGraphShell
        title="Global graph unavailable"
        message={snapshot.error}
        action={{ to: "/", label: "Back to dashboard" }}
      />
    );
  }

  if (!snapshot.data || snapshot.data.nodes.length === 0) {
    return (
      <GlobalGraphShell
        title="No sites checked yet"
        message="Check at least one client website to build the combined map of trackers and third-party services across your portfolio."
        action={{ to: "/", label: "Back to dashboard" }}
      />
    );
  }

  const subtitle = snapshot.data.truncated
    ? `Showing top ${String(snapshot.data.nodes.length)} of ${String(snapshot.data.totalNodes)} domains`
    : `${String(snapshot.data.nodes.length)} domains across all scans`;

  return (
    <GraphViewer
      snapshot={snapshot.data}
      title="Global graph"
      subtitle={subtitle}
      backTo="/"
      defaultLayout="tree"
      extras={
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-mute">Seen on</span>
          {[1, 2, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMinSeenOn(n)}
              className={`rounded-md px-2 py-1 text-[12px] ${
                minSeenOn === n ? "bg-ink text-canvas" : "text-mute hover:text-ink"
              }`}
            >
              {n}+ sites
            </button>
          ))}
        </div>
      }
    />
  );
}

function GlobalGraphShell({
  title,
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas px-8 py-10 text-ink">
      <header className="flex items-center justify-between gap-4">
        <p className="font-display text-xl">OutTrace</p>
        <Link to="/" className="text-[13px] text-mute underline hover:text-ink">
          Dashboard
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <p className="text-[11px] tracking-[0.14em] text-mute uppercase">Global graph</p>
        {title ? <h1 className="font-display mt-3 max-w-lg text-4xl">{title}</h1> : null}
        <p className={`max-w-md text-[14px] leading-relaxed text-mute ${title ? "mt-3" : "mt-3 text-[15px]"}`}>
          {message}
        </p>
        {action ? (
          <Link
            to={action.to}
            className="mt-8 rounded-md bg-ink px-4 py-2 text-[13px] text-canvas hover:opacity-90"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
