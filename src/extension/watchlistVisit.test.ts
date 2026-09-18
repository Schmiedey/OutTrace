import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  watched: vi.fn(), latest: vi.fn(), site: vi.fn(), graph: vi.fn(), scan: vi.fn(), badge: vi.fn(), diff: vi.fn(),
}));
vi.mock("@/src/storage/watchedSites", () => ({ isWatchedSite: mocks.watched }));
vi.mock("@/src/storage/scans", () => ({ getLatestScanForSite: mocks.latest, getSiteByDomain: mocks.site, getScanGraph: mocks.graph, getScan: vi.fn().mockResolvedValue({ id: 2 }) }));
vi.mock("@/src/extension/scanFlow", () => ({ scanActiveTab: mocks.scan }));
vi.mock("@/src/extension/badge", () => ({ setWatchlistBadge: mocks.badge }));
vi.mock("@/src/analysis/diff", () => ({ diffSnapshots: mocks.diff }));
import { scanWatchedVisit } from "./watchlistVisit";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.watched.mockResolvedValue(true);
  mocks.site.mockResolvedValue({ id: 1 });
  mocks.latest.mockResolvedValue({ id: 1 });
  mocks.graph.mockResolvedValue({ nodes: [], edges: [] });
  mocks.scan.mockResolvedValue(2);
});
describe("watchlist visit badge", () => {
  it("badges only newly discovered third-party domains", async () => {
    mocks.diff.mockReturnValue({ added: [{ domain: "new.test", isOrigin: false, isFirstParty: false }, { domain: "example.test", isOrigin: true, isFirstParty: true }] });
    await expect(scanWatchedVisit(7, "https://example.test/article")).resolves.toBe(1);
    expect(mocks.scan).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7, openReport: false, watchedSite: true }));
    expect(mocks.badge).toHaveBeenCalledWith(7, 1);
  });
  it("does nothing for a site the user did not explicitly watch", async () => {
    mocks.watched.mockResolvedValue(false);
    await expect(scanWatchedVisit(7, "https://example.test/")).resolves.toBe(0);
    expect(mocks.scan).not.toHaveBeenCalled();
  });
});
