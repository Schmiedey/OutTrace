import { refreshActiveTabBadge } from "@/src/extension/badge";
import { canScanUrl, explainScanBlock } from "@/src/extension/permissions";
import {
  findingsFromRequests,
  startRequestCapture,
  stopRequestCapture,
} from "@/src/extension/requestLog";
import type { ScanProgressUpdate } from "@/src/extension/scanProgress";
import { persistScan, type PersistScanOptions } from "@/src/storage/scans";
import type { RawFinding, RawScanPayload } from "@/src/types/graph";

export const WATCH_DURATION_MS = 15_000;
export const QUICK_SCAN_TIMEOUT_MS = 20_000;

type ProgressCallback = (update: ScanProgressUpdate) => void;

export type ScanRunOptions = PersistScanOptions & {
  openReport?: boolean;
  tabId?: number;
  url?: string;
  notifyIfNew?: boolean;
  force?: boolean;
  onProgress?: ProgressCallback;
  allFrames?: boolean;
};

function reportProgress(
  callback: ScanRunOptions["onProgress"],
  phase: ScanProgressUpdate["phase"],
  percent: number,
  label: string,
): void {
  callback?.({ phase, percent, label });
}

function readInjectedScan(): RawScanPayload | undefined {
  const scope = globalThis as typeof globalThis & {
    __LINKSCOPE_SCAN__?: RawScanPayload;
  };
  const payload = scope.__LINKSCOPE_SCAN__;
  delete scope.__LINKSCOPE_SCAN__;
  return payload;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function mergeFindings(base: RawFinding[], extra: RawFinding[]): RawFinding[] {
  const findingKey = (item: RawFinding): string =>
    `${item.type}|${item.url}|${item.documentUrl ?? ""}|${item.initiatorUrl ?? ""}`;
  const seen = new Set(base.map(findingKey));
  const findings = [...base];
  for (const item of extra) {
    const key = findingKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(item);
  }
  return findings;
}

function mergePayloads(
  first: RawScanPayload,
  second: RawScanPayload,
): RawScanPayload {
  return {
    url: first.url || second.url,
    title: first.title || second.title,
    hostname: first.hostname || second.hostname,
    findings: mergeFindings(first.findings, second.findings),
  };
}

async function resolveTargetTab(): Promise<{ id: number; url: string }> {
  const [active] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (active?.id && active.url && canScanUrl(active.url)) {
    return { id: active.id, url: active.url };
  }
  throw new Error(explainScanBlock(active?.url));
}

export async function getScanTarget(): Promise<{
  id: number;
  url: string;
} | null> {
  try {
    return await resolveTargetTab();
  } catch {
    return null;
  }
}

function injectionFailure(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  const lower = detail.toLowerCase();
  if (
    lower.includes("cannot access") ||
    lower.includes("missing host permission")
  ) {
    return new Error(
      "LinkScope could not access this page. Reload it and try again, or restore the site-access permission.",
    );
  }
  if (
    lower.includes("frame") ||
    lower.includes("script") ||
    lower.includes("injection")
  ) {
    return new Error(
      "This page blocked the LinkScope scanner. Reload the page and try again.",
    );
  }
  return new Error("The page could not be scanned. Reload it and try again.");
}

export async function injectCollector(
  tabId: number,
  allFrames = true,
): Promise<RawScanPayload> {
  const target = allFrames ? { tabId, allFrames: true as const } : { tabId };
  try {
    await browser.scripting.executeScript({
      target,
      files: ["/page-scanner.js"],
    });
  } catch (error) {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ["/page-scanner.js"],
      });
    } catch {
      throw injectionFailure(error);
    }
  }

  let results: Array<{ frameId?: number; result?: RawScanPayload }>;
  try {
    results = (await browser.scripting.executeScript({
      target,
      func: readInjectedScan,
    })) as Array<{ frameId?: number; result?: RawScanPayload }>;
  } catch (error) {
    try {
      results = (await browser.scripting.executeScript({
        target: { tabId },
        func: readInjectedScan,
      })) as Array<{ frameId?: number; result?: RawScanPayload }>;
    } catch {
      throw injectionFailure(error);
    }
  }

  const payloads = results
    .map((row) => row.result)
    .filter((item): item is RawScanPayload =>
      Boolean(item?.url && item.findings),
    );
  const top =
    results.find((row) => row.frameId === 0)?.result ??
    payloads.find((item) => item.hostname) ??
    payloads[0];
  if (!top) {
    throw new Error(
      "The page returned no scan data. Its security policy may have blocked the scanner.",
    );
  }

  let merged = top;
  for (const payload of payloads) {
    if (payload === top) continue;
    merged = mergePayloads(merged, payload);
  }
  return merged;
}

export function withCapturedRequests(
  raw: RawScanPayload,
  tabId: number,
): RawScanPayload {
  const hops = stopRequestCapture(tabId);
  if (hops.length === 0) return raw;
  return {
    ...raw,
    findings: mergeFindings(raw.findings, findingsFromRequests(hops)),
  };
}

async function openGraphTab(
  scanId: number,
  replaceTabId?: number,
): Promise<void> {
  const url = browser.runtime.getURL(`/app.html#/graph/${String(scanId)}`);
  if (replaceTabId !== undefined) {
    try {
      await browser.tabs.update(replaceTabId, { url, active: true });
      return;
    } catch {
      // The waiting tab may have been closed.
    }
  }
  await browser.tabs.create({ url });
}

export async function scanActiveTab(
  options: ScanRunOptions = {},
): Promise<number> {
  const tab =
    options.tabId !== undefined && options.url
      ? { id: options.tabId, url: options.url }
      : await resolveTargetTab();
  const openReport = options.openReport !== false;
  if (options.captureMode === "automatic") {
    const { shouldAutomaticallyScan } =
      await import("@/src/extension/autoProtect");
    if (!(await shouldAutomaticallyScan(tab.url)))
      throw new Error("Quiet check cancelled.");
  }
  reportProgress(options.onProgress, "preparing", 10, "Connecting to page…");
  startRequestCapture(tab.id);
  let raw: RawScanPayload;
  try {
    reportProgress(
      options.onProgress,
      "collecting",
      28,
      "Reading page resources…",
    );
    raw = withCapturedRequests(
      await withTimeout(
        injectCollector(tab.id, options.allFrames),
        QUICK_SCAN_TIMEOUT_MS,
        "The quick scan timed out. Reload the page and try again.",
      ),
      tab.id,
    );
  } catch (error) {
    stopRequestCapture(tab.id);
    throw error;
  }
  reportProgress(
    options.onProgress,
    "analyzing",
    62,
    "Tracing third-party connections…",
  );
  if (options.captureMode === "automatic") {
    const { shouldAutomaticallyScan } =
      await import("@/src/extension/autoProtect");
    if (!(await shouldAutomaticallyScan(tab.url)))
      throw new Error("Quiet check cancelled.");
  }
  reportProgress(
    options.onProgress,
    "saving",
    76,
    "Classifying and saving domains…",
  );
  const scanId = await persistScan(raw, options);
  reportProgress(options.onProgress, "saving", 94, "Updating site history…");
  await refreshActiveTabBadge();
  if (openReport) await openGraphTab(scanId);
  reportProgress(options.onProgress, "complete", 100, "Quick scan complete");
  return scanId;
}

export async function watchActiveTab(
  durationMs = WATCH_DURATION_MS,
  extendedHistory?: boolean,
): Promise<number> {
  const tab = await resolveTargetTab();
  const waitingUrl = browser.runtime.getURL(
    `/app.html#/watching?ms=${String(durationMs)}`,
  );
  const waiting = await browser.tabs.create({ url: waitingUrl });

  startRequestCapture(tab.id);
  try {
    const first = await injectCollector(tab.id, true);
    await delay(durationMs);
    const second = await injectCollector(tab.id, true);
    const raw = withCapturedRequests(mergePayloads(first, second), tab.id);
    const scanId = await persistScan(raw, {
      captureMode: "watch",
      durationMs,
      extendedHistory,
    });
    await refreshActiveTabBadge();
    await openGraphTab(scanId, waiting.id);
    return scanId;
  } catch (error) {
    stopRequestCapture(tab.id);
    const message = error instanceof Error ? error.message : "Watch failed.";
    if (waiting.id !== undefined) {
      const failedUrl = browser.runtime.getURL(
        `/app.html#/watching?error=${encodeURIComponent(message)}`,
      );
      try {
        await browser.tabs.update(waiting.id, { url: failedUrl });
      } catch {
        // Ignore a closed waiting tab.
      }
    }
    throw error;
  }
}

export async function openDashboard(hash = "/"): Promise<void> {
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  const url = browser.runtime.getURL(
    `/app.html#${path.startsWith("/") ? path : `/${path}`}`,
  );
  await browser.tabs.create({ url });
}
