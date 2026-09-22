import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, FileText, ScanSearch } from "lucide-react";
import { ProductHuntBadge } from "@/src/components/ProductHuntBadge";
import { Button } from "@/src/components/ui/button";
import {
  OnboardingScreenshot,
  OnboardingStep,
} from "@/src/components/welcome/OnboardingScreenshot";
import { cn } from "@/src/lib/utils";
import { normalizeWatchedSiteUrl } from "@/src/storage/watchedSites";

const ONBOARDING = {
  pin: "/onboarding/pin-outtrace.png",
  site: "/onboarding/open-site.png",
  check: "/onboarding/check-page.png",
} as const;

export function WelcomePage() {
  const [url, setUrl] = useState("");
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFirstSite = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const target = normalizeWatchedSiteUrl(url);
      await browser.tabs.create({ url: target.url });
      setOpened(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open this website.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas px-6 py-10 text-ink sm:px-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
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
          <p className="text-[11px] tracking-[0.14em] text-mute uppercase">
            Start here
          </p>
          <h2 className="font-display mt-2 text-2xl">
            Map what one website connects to
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-mute">
            Your first check shows what is on the page now and creates the
            baseline. A later check shows what changed.
          </p>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void openFirstSite();
            }}
          >
            <label htmlFor="first-site" className="text-[12px] text-mute">
              Website you maintain or want to inspect
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="first-site"
                type="text"
                inputMode="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setOpened(false);
                }}
                placeholder="example.com"
                autoComplete="url"
                required
                className="h-11 min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 text-[14px] outline-none focus:border-ink"
              />
              <Button type="submit" disabled={!url.trim() || busy}>
                {busy ? "Opening…" : "Open website"}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>
          {error ? (
            <p role="alert" className="mt-3 text-[13px] text-rose">
              {error}
            </p>
          ) : null}
          {opened ? (
            <p role="status" className="mt-4 text-[13px] text-ink">
              Website opened. Click the OutTrace toolbar icon there, then choose
              “Check this page.”
            </p>
          ) : null}
          <p className="mt-4 text-[12px] text-mute">
            Opening the site does not scan it. Manual checks are unlimited and
            free, with no account required.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="how-a-check-works">
          <p className="text-[11px] tracking-[0.16em] text-mute uppercase">
            Get started
          </p>
          <h2
            id="how-a-check-works"
            className="font-display mt-2 text-3xl sm:text-4xl"
          >
            Your first check in three steps
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-mute">
            Pin OutTrace, open a client site in Chrome, then capture that page
            from the toolbar. That first snapshot is what future comparisons
            build on.
          </p>

          <ol className="mt-12 space-y-16 sm:space-y-20">
            <OnboardingStep
              number="Step 01"
              title="Pin OutTrace to the toolbar"
              visual={
                <OnboardingScreenshot
                  src={ONBOARDING.pin}
                  alt="Chrome extensions menu with OutTrace pinned to the toolbar"
                  aspect="880/520"
                  objectPosition="right top"
                  badge="Pin"
                />
              }
            >
              <p>
                Click the puzzle piece in Chrome, find OutTrace, and click the
                pin so the icon stays visible.
              </p>
            </OnboardingStep>

            <OnboardingStep
              number="Step 02"
              title="Open the client site"
              reverse
              visual={
                <OnboardingScreenshot
                  src={ONBOARDING.site}
                  alt="Browser tab open on a client website ready to scan"
                  aspect="870/800"
                  badge="Site"
                />
              }
            >
              <p>
                Go to the page you maintain — homepage, checkout, or the view you
                want to document. OutTrace reads the live tab when you check it.
              </p>
            </OnboardingStep>

            <OnboardingStep
              number="Step 03"
              title="Check this page"
              visual={
                <OnboardingScreenshot
                  src={ONBOARDING.check}
                  alt="OutTrace popup showing Check this page on a client site"
                  aspect="1280/800"
                  badge="Capture"
                />
              }
            >
              <p>
                Click the OutTrace icon, then “Check this page.” You’ll see
                trackers, third parties, and unknown services for that capture.
              </p>
              <p className="text-[13px]">
                Shortcut: Alt+Shift+L. Manual checks are unlimited and free. No
                account.
              </p>
            </OnboardingStep>
          </ol>
        </section>

        <section className="mt-16 grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-3">
          <Outcome icon={ScanSearch} number="01" title="See what connected">
            Known trackers and unknown services are distinguished on that page,
            and stay on this device.
          </Outcome>
          <Outcome icon={Eye} number="02" title="Watch for changes">
            Watch two sites when you visit for free. Pro adds daily and weekly
            checks while your browser is running.
          </Outcome>
          <Outcome icon={FileText} number="03" title="Show the evidence">
            After an update, compare captures and download or print a report for
            your client.
          </Outcome>
        </section>
        <WelcomeDashboardCta />
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

function WelcomeDashboardCta() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "0px 0px -72px 0px", threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <Link
        to="/"
        className={cn(
          "fixed right-6 bottom-6 z-50 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-[13px] font-medium text-canvas shadow-[0_12px_32px_rgba(23,23,23,0.18)] transition-[opacity,transform] duration-300 hover:bg-ink/90",
          visible
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        Go to dashboard
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </>
  );
}

function Outcome({
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
