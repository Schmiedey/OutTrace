import { Link } from "react-router-dom";
import { useAsync } from "@/src/lib/useAsync";
import { getPortfolio } from "@/src/storage/portfolio";

export function GettingStarted() {
  const portfolio = useAsync(getPortfolio, []);
  if (!portfolio.data) return null;
  const rows = portfolio.data;
  const first = rows.find((row) => row.latest);
  const monitored = rows.some(
    (row) => row.watch?.enabled && row.watch.accessGranted,
  );
  if (first && monitored) return null;
  return (
    <section
      className="mb-8 rounded-md border border-ink/20 bg-panel p-6"
      aria-label="Get started"
    >
      <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
        Your next step
      </p>
      <h2 className="font-display mt-2 text-3xl">
        {first
          ? "Make this first check keep working for you."
          : "Start with a website you maintain."}
      </h2>
      <p className="mt-3 max-w-2xl text-[14px] text-mute">
        {first
          ? `You have a saved capture of ${first.domain}. Watch the site to compare future captures and spot new trackers or outside services.`
          : "Check a client website, understand its outside services, then watch for changes after deployments and plugin updates."}
      </p>
      <div className="mt-5 flex flex-wrap gap-4">
        <Link
          className="rounded-md bg-ink px-4 py-2 text-[13px] text-canvas"
          to={
            first
              ? `/following?url=${encodeURIComponent(first.latest!.url)}`
              : "/welcome"
          }
        >
          {first ? "Watch this site" : "Set up my first check"}
        </Link>
        <Link
          className="py-2 text-[13px] underline"
          to={first ? `/reports/${first.latest!.id}` : "/audits/new"}
        >
          {first ? "Preview a client report" : "Start a site audit"}
        </Link>
      </div>
      <p className="mt-4 text-[12px] text-mute">
        Two visit-only watched sites are free. Pro adds daily or weekly checks
        while your browser is running.
      </p>
    </section>
  );
}
