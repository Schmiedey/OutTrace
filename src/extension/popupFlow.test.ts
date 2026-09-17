import { describe, expect, it, vi } from "vitest";
import { loadCachedFirst, popupScanIsDue, POPUP_FRESH_MS } from "./popupFlow";
describe("cached-first popup", () => {
  it("skips recent scans and refreshes at 30 minutes", () => {
    expect(popupScanIsDue(1, POPUP_FRESH_MS)).toBe(false);
    expect(popupScanIsDue(0, POPUP_FRESH_MS)).toBe(true);
    expect(popupScanIsDue(undefined)).toBe(true);
  });
  it("renders cached content before a stale refresh", async () => {
    const order: string[] = [];
    await loadCachedFirst({
      load: async () => ({ latest: { timestamp: 0 } }),
      render: () => {
        order.push("render");
      },
      refresh: async () => {
        order.push("scan");
      },
      now: POPUP_FRESH_MS,
    });
    expect(order).toEqual(["render", "scan", "render"]);
  });
  it("does not refresh a recent result", async () => {
    const refresh = vi.fn();
    await loadCachedFirst({
      load: async () => ({ latest: { timestamp: 10 } }),
      render: vi.fn(),
      refresh,
      now: 20,
    });
    expect(refresh).not.toHaveBeenCalled();
  });
  it("scans a first-ever site", async () => {
    const refresh = vi.fn();
    await loadCachedFirst({ load: async () => null, render: vi.fn(), refresh });
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("does not refresh when opened in read-only mode", async () => {
    const cached = { latest: { timestamp: 0 } };
    const render = vi.fn();
    const refresh = vi.fn();
    await loadCachedFirst({
      load: async () => cached,
      render,
      refresh,
      autoRefresh: false,
    });
    expect(render).toHaveBeenCalledWith(cached);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("leaves cached information visible after failed refresh", async () => {
    const cached = { latest: { timestamp: 0 } };
    const render = vi.fn();
    await expect(
      loadCachedFirst({
        load: async () => cached,
        render,
        refresh: async () => {
          throw new Error("Permission removed");
        },
      }),
    ).rejects.toThrow();
    expect(render).toHaveBeenCalledExactlyOnceWith(cached);
  });
  it("does no work after popup closure", async () => {
    const refresh = vi.fn();
    const render = vi.fn();
    await loadCachedFirst({
      load: async () => null,
      render,
      refresh,
      isAlive: () => false,
    });
    expect(render).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("does not clear cached results if a newly saved result cannot be loaded", async () => {
    const cached = { latest: { timestamp: 0 } };
    const render = vi.fn();
    const load = vi
      .fn()
      .mockResolvedValueOnce(cached)
      .mockResolvedValueOnce(null);
    await loadCachedFirst({ load, render, refresh: async () => {} });
    expect(render.mock.calls.map(([value]) => value)).toEqual([cached, cached]);
  });
});
