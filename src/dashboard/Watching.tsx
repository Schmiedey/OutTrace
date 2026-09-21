import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";

const DEFAULT_WATCH_MS = 15_000;

function readDurationMs(search: string): number {
  const value = Number(new URLSearchParams(search).get("ms"));
  if (Number.isFinite(value) && value > 0) return value;
  const hash = window.location.hash;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const fromHash = Number(new URLSearchParams(query).get("ms"));
  if (Number.isFinite(fromHash) && fromHash > 0) return fromHash;
  return DEFAULT_WATCH_MS;
}

export function WatchingPage() {
  const [params] = useSearchParams();
  const error = params.get("error");
  const total = readDurationMs(params.toString() ? `?${params.toString()}` : window.location.hash);
  const [left, setLeft] = useState(() => Math.max(1, Math.ceil(total / 1000)));

  useEffect(() => {
    if (error) return;
    const duration = readDurationMs(window.location.hash);
    const started = Date.now();
    setLeft(Math.max(1, Math.ceil(duration / 1000)));
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((duration - (Date.now() - started)) / 1000));
      setLeft(remaining);
    }, 200);
    return () => window.clearInterval(tick);
  }, [error]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <p className="text-[12px] text-mute">OutTrace</p>
        <h1 className="font-display mt-3 text-4xl">Watch failed</h1>
        <p className="mt-3 max-w-md text-[14px] text-rose">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
      <p className="text-[12px] text-mute">Watching the page</p>
      <h1 className="font-display mt-3 text-6xl tabular-nums">{left}</h1>
      <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-mute">
        Leave the site open. Delayed scripts, consent pixels, and late XHR will be folded into this scan.
      </p>
    </div>
  );
}
