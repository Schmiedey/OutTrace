import { describe, expect, it, vi } from "vitest";
import { requirePro, runProAction } from "@/src/billing/entitlements";

describe("Pro entitlements", () => {
  it("rejects a gated action for a free account without running it", async () => {
    const action = vi.fn(() => "ran");

    await expect(runProAction({ paid: false }, "export", action)).rejects.toThrow(
      "Export requires LinkScope Pro.",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("runs the same gated action for a paid account", async () => {
    const action = vi.fn(() => "ran");

    await expect(runProAction({ paid: true }, "export", action)).resolves.toBe("ran");
    expect(action).toHaveBeenCalledOnce();
  });

  it("uses the feature-specific error at the service boundary", () => {
    expect(() => requirePro({ paid: false }, "deep-audit")).toThrow(
      "Deep audits require LinkScope Pro.",
    );
    expect(() => requirePro({ paid: true }, "deep-audit")).not.toThrow();
  });
});
