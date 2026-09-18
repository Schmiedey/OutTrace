import { canonicalAuditUrl } from "@/src/audit/url";
import type { RawScanPayload } from "@/src/types/graph";

export const DISCOVERY_REQUEST_TIMEOUT_MS = 8_000;

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function xmlLocations(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi))
    .map((match) => decodeXml((match[1] ?? "").trim()))
    .filter(Boolean);
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = fetch(url, {
      redirect: "follow",
      credentials: "omit",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      return await response.text();
    });
    const deadline = new Promise<null>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, DISCOVERY_REQUEST_TIMEOUT_MS);
    });
    return await Promise.race([request, deadline]);
  } catch {
    return null;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function discoverSitemapUrls(rootUrl: string, candidateLimit: number): Promise<string[]> {
  const root = new URL(rootUrl);
  const robotsUrl = new URL("/robots.txt", root).href;
  const robots = await fetchText(robotsUrl);
  const sitemapUrls = new Set<string>([new URL("/sitemap.xml", root).href]);
  if (robots) {
    for (const match of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
      if (match[1]) sitemapUrls.add(new URL(match[1], root).href);
    }
  }

  const pages = new Set<string>();
  const queue = Array.from(sitemapUrls);
  const visited = new Set<string>();
  while (queue.length > 0 && visited.size < 12 && pages.size < candidateLimit) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;
    const locations = xmlLocations(xml);
    const isIndex = /<sitemapindex\b/i.test(xml);
    for (const location of locations) {
      if (isIndex) {
        if (!visited.has(location) && queue.length < 24) queue.push(location);
        continue;
      }
      const canonical = canonicalAuditUrl(location, rootUrl);
      if (canonical) pages.add(canonical);
      if (pages.size >= candidateLimit) break;
    }
  }
  return Array.from(pages);
}

export function discoverPayloadLinks(raw: RawScanPayload, rootUrl: string): string[] {
  const urls = new Set<string>();
  for (const finding of raw.findings) {
    if (finding.type !== "link") continue;
    const canonical = canonicalAuditUrl(finding.url, rootUrl);
    if (canonical) urls.add(canonical);
  }
  return Array.from(urls);
}
