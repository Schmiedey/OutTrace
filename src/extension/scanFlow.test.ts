import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  persist: vi.fn(),
  due: vi.fn(),
  badge: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/src/storage/scans", () => ({ persistScan: mocks.persist }));
vi.mock("@/src/extension/badge", () => ({
  refreshActiveTabBadge: mocks.badge,
}));
vi.mock("@/src/extension/autoProtect", () => ({
  shouldAutomaticallyScan: mocks.due,
}));
vi.mock("@/src/extension/requestLog", () => ({
  startRequestCapture: mocks.start,
  stopRequestCapture: mocks.stop,
  findingsFromRequests: () => [],
}));
import { scanActiveTab } from "./scanFlow";
const executeScript = vi.fn();
const request = vi.fn();
const fetch = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.persist.mockResolvedValue(7);
  mocks.due.mockResolvedValue(true);
  mocks.stop.mockReturnValue([]);
  executeScript.mockImplementation(async (details) =>
    details.files
      ? []
      : [
          {
            frameId: 0,
            result: {
              url: "https://example.test/private",
              hostname: "example.test",
              title: "Private page",
              findings: [],
            },
          },
        ],
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("browser", {
    tabs: {
      query: async () => [{ id: 1, url: "https://example.test/private" }],
      create: vi.fn(),
    },
    scripting: { executeScript },
    permissions: { request },
  });
});
describe("local, activeTab manual scans and background cancellation", () => {
  it("manually scans without requesting broad host permission or sending page data externally", async () => {
    expect(await scanActiveTab({ openReport: false })).toBe(7);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ["/page-scanner.js"],
        target: { tabId: 1, allFrames: true },
      }),
    );
    expect(request).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledOnce();
  });
  it("handles permission removal gracefully without persisting a failed scan", async () => {
    executeScript.mockRejectedValue(new Error("Missing host permission"));
    await expect(scanActiveTab({ openReport: false })).rejects.toThrow(
      "restore the site-access permission",
    );
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalled();
  });
  it("does not inject after Quiet Protection is disabled", async () => {
    mocks.due.mockResolvedValue(false);
    await expect(
      scanActiveTab({ openReport: false, captureMode: "automatic" }),
    ).rejects.toThrow("cancelled");
    expect(executeScript).not.toHaveBeenCalled();
  });
  it("keeps the quick scan to the current page frame", async () => {
    await scanActiveTab({ openReport: false, allFrames: false });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );
  });
  it("does not save a background capture if protection is disabled or access removed during collection", async () => {
    mocks.due.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(
      scanActiveTab({ openReport: false, captureMode: "automatic" }),
    ).rejects.toThrow("cancelled");
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
