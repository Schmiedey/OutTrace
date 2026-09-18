import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestWatchlistPermission, revokeWatchlistPermission } from "./watchlistPermission";

const request = vi.fn();
const remove = vi.fn();
beforeEach(() => {
  request.mockReset(); remove.mockReset();
  vi.stubGlobal("browser", { permissions: { request, remove } });
});

describe("watchlist origin consent", () => {
  it("asks only for the hostname the user added", async () => {
    request.mockResolvedValue(true);
    await requestWatchlistPermission("https://www.example.test/path");
    expect(request).toHaveBeenCalledWith({ permissions: ["webNavigation"], origins: ["*://www.example.test/*"] });
  });
  it("removes that exact origin when a watched site is removed", async () => {
    remove.mockResolvedValue(true);
    await revokeWatchlistPermission("https://www.example.test/");
    expect(remove).toHaveBeenCalledWith({ origins: ["*://www.example.test/*"] });
  });
});
