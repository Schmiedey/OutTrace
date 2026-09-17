import type {
  ConnectionType,
  RawFinding,
  RawScanPayload,
} from "@/src/types/graph";

const MAX_FINDINGS = 4000;
const RESOURCE_BUFFER_SIZE = 10_000;

type WatchState = {
  extras: RawFinding[];
  seen: Set<string>;
  observer: PerformanceObserver | null;
};

function getWatchState(): WatchState {
  const scope = globalThis as typeof globalThis & {
    __LINKSCOPE_WATCH__?: WatchState;
  };
  if (!scope.__LINKSCOPE_WATCH__) {
    scope.__LINKSCOPE_WATCH__ = { extras: [], seen: new Set(), observer: null };
  }
  return scope.__LINKSCOPE_WATCH__;
}

function typeFromInitiator(initiator: string): ConnectionType {
  if (initiator === "script") return "script";
  if (initiator === "img" || initiator === "image") return "image";
  if (initiator === "css" || initiator === "link") return "stylesheet";
  if (initiator === "iframe") return "iframe";
  if (initiator === "video" || initiator === "audio") return "media";
  return "network";
}

function recordResourceEntry(entry: PerformanceResourceTiming): void {
  const state = getWatchState();
  const url = entry.name;
  if (!url || state.seen.has(url) || state.extras.length >= MAX_FINDINGS)
    return;
  state.seen.add(url);
  const type = typeFromInitiator(entry.initiatorType || "other");
  state.extras.push({
    type,
    url,
    snippet: `performance:${entry.initiatorType || "other"} ${url.slice(0, 256)}`,
    documentUrl: location.href,
  });
}

/**
 * Expand Chrome's Resource Timing buffer and keep a PerformanceObserver on
 * `globalThis` so later `executeScript` injections in this frame reuse it.
 */
export function ensureResourceWatch(): void {
  try {
    performance.setResourceTimingBufferSize(RESOURCE_BUFFER_SIZE);
  } catch {
    // Some pages restrict Performance Timeline writes.
  }

  const state = getWatchState();
  if (state.observer) return;

  const supported =
    typeof PerformanceObserver !== "undefined" &&
    (!PerformanceObserver.supportedEntryTypes ||
      PerformanceObserver.supportedEntryTypes.includes("resource"));
  if (!supported) return;

  try {
    state.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        recordResourceEntry(entry);
      }
    });
    state.observer.observe({ type: "resource", buffered: true });
  } catch {
    state.observer = null;
  }
}

/** DOM + Resource Timing snapshot. Bundled into page-scanner.js, not serialized. */
export function collectPageFindings(): RawScanPayload {
  ensureResourceWatch();

  const MAX = MAX_FINDINGS;
  const SNIPPET = 280;

  const types = [
    "link",
    "script",
    "image",
    "iframe",
    "stylesheet",
    "font",
    "media",
    "network",
    "other",
  ] as const;

  type LocalType = (typeof types)[number];

  const findings: RawFinding[] = [];
  const seen = new Set<string>();

  const skip = (raw: string): boolean => {
    const value = raw.trim().toLowerCase();
    if (!value || value === "#" || value.startsWith("javascript:")) return true;
    if (value.startsWith("mailto:") || value.startsWith("tel:")) return true;
    if (value.startsWith("data:") || value.startsWith("blob:")) return true;
    if (value.startsWith("about:") || value.startsWith("chrome:")) return true;
    if (
      value.startsWith("chrome-extension:") ||
      value.startsWith("moz-extension:")
    )
      return true;
    return false;
  };

  const resolve = (raw: string): string | null => {
    if (skip(raw)) return null;
    try {
      return new URL(raw, location.href).href;
    } catch {
      return null;
    }
  };

  const snippetOf = (el: Element): string => {
    return el.outerHTML.replace(/\s+/g, " ").trim().slice(0, SNIPPET);
  };

  const add = (
    type: LocalType,
    rawUrl: string,
    snippet: string,
    context?: string,
  ): void => {
    if (findings.length >= MAX) return;
    const url = resolve(rawUrl);
    if (!url) return;
    const key = `${type}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    const finding: RawFinding = {
      type: type as ConnectionType,
      url,
      snippet,
      documentUrl: location.href,
    };
    if (context) finding.context = context.slice(0, 160);
    findings.push(finding);
  };

  const attr = (el: Element, name: string): string | null => {
    const value = el.getAttribute(name);
    return value && value.trim() ? value.trim() : null;
  };

  for (const el of document.querySelectorAll("a[href]")) {
    if (findings.length >= MAX) break;
    const href = attr(el, "href");
    if (!href) continue;
    add(
      "link",
      href,
      snippetOf(el),
      el.textContent?.replace(/\s+/g, " ").trim(),
    );
  }

  for (const el of document.querySelectorAll("script[src]")) {
    if (findings.length >= MAX) break;
    const src = attr(el, "src");
    if (src) add("script", src, snippetOf(el));
  }

  for (const el of document.querySelectorAll("img")) {
    if (findings.length >= MAX) break;
    const src = attr(el, "src");
    if (src) add("image", src, snippetOf(el), attr(el, "alt") ?? undefined);
    const srcset = attr(el, "srcset");
    if (srcset) {
      for (const part of srcset.split(",")) {
        if (findings.length >= MAX) break;
        const url = part.trim().split(/\s+/)[0];
        if (url) add("image", url, snippetOf(el));
      }
    }
  }

  for (const el of document.querySelectorAll("iframe[src], frame[src]")) {
    if (findings.length >= MAX) break;
    const src = attr(el, "src");
    if (src) add("iframe", src, snippetOf(el));
  }

  for (const el of document.querySelectorAll("link[href]")) {
    if (findings.length >= MAX) break;
    const href = attr(el, "href");
    if (!href) continue;
    const rel = (attr(el, "rel") ?? "").toLowerCase();
    const as = (attr(el, "as") ?? "").toLowerCase();
    let type: LocalType = "other";
    if (rel.includes("stylesheet")) type = "stylesheet";
    else if (rel.includes("icon")) type = "image";
    else if (rel.includes("preload") && as === "font") type = "font";
    else if (rel.includes("font") || as === "font") type = "font";
    else if (
      rel.includes("preload") ||
      rel.includes("prefetch") ||
      rel.includes("preconnect") ||
      rel.includes("dns-prefetch")
    ) {
      type = "network";
    } else if (as === "script") type = "script";
    else if (as === "image") type = "image";
    else if (as === "style") type = "stylesheet";
    add(type, href, snippetOf(el), rel || undefined);
  }

  for (const el of document.querySelectorAll(
    "video[src], audio[src], source[src], track[src]",
  )) {
    if (findings.length >= MAX) break;
    const src = attr(el, "src");
    if (src) add("media", src, snippetOf(el));
  }

  for (const el of document.querySelectorAll("object[data], embed[src]")) {
    if (findings.length >= MAX) break;
    const src = attr(el, "data") ?? attr(el, "src");
    if (src) add("media", src, snippetOf(el));
  }

  for (const el of document.querySelectorAll("form[action]")) {
    if (findings.length >= MAX) break;
    const action = attr(el, "action");
    if (action) add("network", action, snippetOf(el), "form action");
  }

  try {
    const entries = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    for (const entry of entries) {
      if (findings.length >= MAX) break;
      const initiator = entry.initiatorType || "other";
      let type: LocalType = "network";
      if (initiator === "script") type = "script";
      else if (
        initiator === "img" ||
        initiator === "image" ||
        initiator === "css"
      ) {
        type = initiator === "css" ? "stylesheet" : "image";
      } else if (initiator === "iframe") type = "iframe";
      else if (initiator === "video" || initiator === "audio") type = "media";
      else if (initiator === "link") type = "stylesheet";
      else if (
        initiator === "xmlhttprequest" ||
        initiator === "fetch" ||
        initiator === "beacon"
      ) {
        type = "network";
      }
      add(
        type,
        entry.name,
        `performance:${initiator} ${entry.name.slice(0, SNIPPET - 24)}`,
      );
    }
  } catch {
    // Some pages restrict performance timeline access.
  }

  return {
    url: location.href,
    title: document.title || location.hostname,
    hostname: location.hostname,
    findings: findings.slice(0, MAX_FINDINGS),
  };
}

export function installLinkScopeCollector(): RawScanPayload {
  ensureResourceWatch();

  const snap = collectPageFindings();
  const seen = new Set(snap.findings.map((item) => `${item.type}|${item.url}`));
  for (const extra of getWatchState().extras) {
    const key = `${extra.type}|${extra.url}`;
    if (seen.has(key) || snap.findings.length >= MAX_FINDINGS) continue;
    seen.add(key);
    snap.findings.push(extra);
  }

  const scope = globalThis as typeof globalThis & {
    __LINKSCOPE_SCAN__?: RawScanPayload;
  };
  scope.__LINKSCOPE_SCAN__ = snap;
  return snap;
}
