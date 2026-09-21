import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/src/storage/database";
import {
  blockDomain,
  restorePersistedBlockRules,
  uBlockFilter,
  unblockDomain,
} from "./block";

describe("domain blocking", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
    vi.unstubAllGlobals();
  });

  it("stores a persistent dynamic rule when permission is granted", async () => {
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      permissions: { request: vi.fn().mockResolvedValue(true) },
      declarativeNetRequest: { updateDynamicRules, getDynamicRules: vi.fn().mockResolvedValue([]) },
    });

    await expect(blockDomain("TRACKER.Example")).resolves.toBe("blocked");
    expect(updateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({
        addRules: [
          expect.objectContaining({
            action: { type: "block" },
            condition: expect.objectContaining({ requestDomains: ["tracker.example"] }),
          }),
        ],
      }),
    );
  });

  it("re-applies remembered rules when host access is still granted", async () => {
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    await db.settings.put({
      key: "blocked-domains",
      value: JSON.stringify(["tracker.example"]),
    });
    vi.stubGlobal("browser", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      declarativeNetRequest: {
        updateDynamicRules,
        getDynamicRules: vi.fn().mockResolvedValue([]),
      },
    });

    await restorePersistedBlockRules();
    expect(updateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({
        addRules: [
          expect.objectContaining({
            condition: expect.objectContaining({ requestDomains: ["tracker.example"] }),
          }),
        ],
      }),
    );
  });

  it("does not re-apply a remembered block without host access", async () => {
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    await db.settings.put({
      key: "blocked-domains",
      value: JSON.stringify(["tracker.example"]),
    });
    vi.stubGlobal("browser", {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
      declarativeNetRequest: {
        updateDynamicRules,
        getDynamicRules: vi.fn().mockResolvedValue([]),
      },
    });

    await restorePersistedBlockRules();
    expect(updateDynamicRules).not.toHaveBeenCalled();
  });

  it("forgets a domain when unblocked", async () => {
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      permissions: { request: vi.fn().mockResolvedValue(true) },
      declarativeNetRequest: { updateDynamicRules, getDynamicRules: vi.fn().mockResolvedValue([]) },
    });
    await blockDomain("tracker.example");
    await unblockDomain("tracker.example");
    expect(updateDynamicRules).toHaveBeenLastCalledWith({
      removeRuleIds: [expect.any(Number)],
    });
  });

  it("copies a uBlock filter when host access is declined", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("browser", {
      permissions: { request: vi.fn().mockResolvedValue(false) },
      declarativeNetRequest: {
        updateDynamicRules: vi.fn(),
        getDynamicRules: vi.fn().mockResolvedValue([]),
      },
    });

    await expect(blockDomain("tracker.example")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("||tracker.example^");
  });

  it("keeps the portable uBlock rule format", () => {
    expect(uBlockFilter("tracker.example")).toBe("||tracker.example^");
  });
});
