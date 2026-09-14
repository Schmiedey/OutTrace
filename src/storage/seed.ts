import type { RawScanPayload } from "@/src/types/graph";
import { persistScan } from "@/src/storage/scans";

export const LIVE_SCAN_IDS = [
  "github",
  "wikipedia",
  "guardian",
  "stripe",
  "mdn",
  "bbc",
  "nytimes",
  "stackoverflow",
  "reddit",
  "cloudflare",
] as const;

export const LIVE_SCAN_DOMAINS = [
  "github.com",
  "wikipedia.org",
  "theguardian.com",
  "stripe.com",
  "mozilla.org",
  "bbc.com",
  "nytimes.com",
  "stackoverflow.com",
  "reddit.com",
  "cloudflare.com",
] as const;

function isRawScanPayload(value: unknown): value is RawScanPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === "string" &&
    typeof record.title === "string" &&
    typeof record.hostname === "string" &&
    Array.isArray(record.findings)
  );
}

/** Development-only fixtures captured from real pages. Never called by the production UI. */
export async function seedLiveTen(): Promise<number[]> {
  const ids: number[] = [];
  for (const id of LIVE_SCAN_IDS) {
    const response = await fetch(`/live-scans/${id}.json`);
    if (!response.ok) throw new Error(`Could not load live scan for ${id}.`);
    const payload: unknown = await response.json();
    if (!isRawScanPayload(payload)) throw new Error(`Live scan for ${id} is not valid.`);
    ids.push(await persistScan(payload));
  }
  return ids;
}
