import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, FileText, ScanSearch } from "lucide-react";
import { ProductHuntBadge } from "@/src/components/ProductHuntBadge";
import { Button } from "@/src/components/ui/button";
import { normalizeWatchedSiteUrl } from "@/src/storage/watchedSites";

export function WelcomePage() {
  const [url, setUrl] = useState("");
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openSite = async () => {
    setError(null);
    setBusy(true);
    try {
      const target = normalizeWatchedSiteUrl(url);
      await browser.tabs.create({ url: target.url });
      setOpened(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open this website.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-canvas px-6 py-10 text-ink sm:px-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-display text-xl">OutTrace</p>
          <Link to="/sites" className="text-[13px] underline">
            Open my portfolio
          </Link>
        </div>
        <p className="mt-14 text-[11px] tracking-[0.16em] text-mute uppercase">
          For people who look after websites
        </p>
        <h1 className="font-display mt-4 max-w-3xl text-5xl leading-[1.02] sm:text-6xl">
          Know what changed.
          <br />
          Before your client asks.
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-mute">
          See the trackers and outside services a page connects to. Keep watch
          after updates. Turn the evidence into a clear client report—all in
          your browser.
        </p>
        <section className="mt-9 max-w-2xl rounded-md border border-line bg-panel p-6">
          <h2 className="font-display text-2xl">
            Start with one client website
          </h2>
          <p className="mt-2 text-[13px] text-mute">
            Open the site, then click the OutTrace extension and choose “Check
            this page.” Your first capture becomes the starting point for future
            comparisons.
          </p>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void openSite();
            }}
          >
            <label htmlFor="first-site" className="text-[12px] text-mute">
              Website address
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="first-site"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setOpened(false);
                }}
                placeholder="your-client.com"
                autoComplete="url"
                required
                className="h-11 min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 outline-none focus:border-ink"
              />
              <Button type="submit" disabled={!url.trim() || busy}>
                {busy ? "Opening…" : "Open website"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
          {error ? (
            <p role="alert" className="mt-3 text-[13px] text-rose">
              {error}
            </p>
          ) : null}
          {opened ? (
            <p role="status" className="mt-4 text-[13px]">
              Website opened. Use the puzzle-piece Extensions menu to pin
              OutTrace, then check the page. Return to your portfolio to review
              and watch it.
            </p>
          ) : null}
          <p className="mt-4 text-[12px] text-mute">
            Opening a website does not start a scan. No account needed. Manual
            page checks are unlimited and free.
          </p>
        </section>
        <section className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-3">
          <Step icon={ScanSearch} number="01" title="Check the page">
            See which third parties connect to the page, with known trackers and
            unknown services clearly distinguished.
          </Step>
          <Step icon={Eye} number="02" title="Watch for changes">
            Watch two sites when you visit for free. Pro adds daily and weekly
            checks while your browser is running.
          </Step>
          <Step icon={FileText} number="03" title="Show the evidence">
            Review new services after an update, then download or print a report
            for your client.
          </Step>
        </section>
        <div className="mt-8 flex flex-wrap justify-between gap-4 text-[13px]">
          <Link to="/audits/new" className="underline">
            Need a broader view? Audit a site
          </Link>
          <Link to="/pro" className="underline">
            Pro · $14.99 once
          </Link>
        </div>
        <div className="mt-10">
          <ProductHuntBadge />
        </div>
        <p className="mt-6 max-w-2xl text-[12px] leading-relaxed text-mute">
          OutTrace reports observed connections. It does not certify legal
          compliance or website safety. Scan contents stay on this device;
          sharing and monitoring are your choice.
        </p>
      </div>
    </main>
  );
}
function Step({
  icon: Icon,
  number,
  title,
  children,
}: {
  icon: typeof Eye;
  number: string;
  title: string;
  children: string;
}) {
  return (
    <div className="bg-canvas p-6">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono text-[11px] text-mute">{number}</span>
      </div>
      <h2 className="font-display mt-5 text-2xl">{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">{children}</p>
    </div>
  );
}
