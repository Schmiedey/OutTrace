import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockDomain, uBlockFilter } from "@/src/extension/block";

describe("domain blocking", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a persistent dynamic rule when permission is granted", async () => {
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      permissions: { request: vi.fn().mockResolvedValue(true) },
      declarativeNetRequest: { updateDynamicRules },
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

  it("keeps the portable uBlock rule format", () => {
    expect(uBlockFilter("tracker.example")).toBe("||tracker.example^");
  });
});
