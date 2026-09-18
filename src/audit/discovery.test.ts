import { afterEach, describe, expect, it, vi } from "vitest";
import { DISCOVERY_REQUEST_TIMEOUT_MS, discoverSitemapUrls } from "./discovery";

afterEach(() => vi.unstubAllGlobals());

describe("sitemap discovery", () => {
  it("abandons a hung discovery request so the root-page audit can continue", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const result = discoverSitemapUrls("https://example.test/", 20);
    await vi.advanceTimersByTimeAsync(DISCOVERY_REQUEST_TIMEOUT_MS * 2);
    await expect(result).resolves.toEqual([]);
    vi.useRealTimers();
  });
});
