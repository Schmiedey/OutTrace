import { describe, expect, it, vi } from "vitest";
import { FREE_AUDIT_LIMIT_MESSAGE, FREE_WATCHED_SITE_LIMIT, requirePro, requireWatchlistCapacity, runProAction } from "@/src/billing/entitlements";

describe("Pro entitlements", () => {
  it("keeps single-page deep scans free", () => {
    expect(() => requirePro({ paid: false }, "deep-scan")).not.toThrow();
    expect(() => requirePro({ paid: false }, "scheduled-checks")).toThrow();
  });
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

  it("explains the daily Free audit limit", () => {
    expect(() => requirePro({ paid: false }, "unlimited-audits")).toThrow(FREE_AUDIT_LIMIT_MESSAGE);
    expect(() => requirePro({ paid: true }, "unlimited-audits")).not.toThrow();
  });

  it("allows two free watched sites and removes the limit for Pro", () => {
    expect(FREE_WATCHED_SITE_LIMIT).toBe(2);
    expect(() => requireWatchlistCapacity({ paid: false }, [], "example.test")).not.toThrow();
    expect(() => requireWatchlistCapacity({ paid: false }, [{ domain: "other.test" }], "example.test")).not.toThrow();
    expect(() => requireWatchlistCapacity({ paid: false }, [{ domain: "one.test" }, { domain: "two.test" }], "example.test")).toThrow("unlimited sites");
    expect(() => requireWatchlistCapacity({ paid: false }, [{ domain: "example.test" }], "example.test")).not.toThrow();
    expect(() => requireWatchlistCapacity({ paid: true }, [{ domain: "other.test" }], "example.test")).not.toThrow();
  });
});
