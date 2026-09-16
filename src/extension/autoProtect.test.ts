import { describe, expect, it } from "vitest";
import { AUTO_SCAN_COOLDOWN_MS, automaticScanIsDue } from "@/src/extension/autoProtect";

describe("automatic protection cooldown", () => {
  it("checks a site with no previous scan", () => {
    expect(automaticScanIsDue(undefined, 100)).toBe(true);
  });

  it("does not repeatedly scan the same site", () => {
    expect(automaticScanIsDue(100, 100 + AUTO_SCAN_COOLDOWN_MS - 1)).toBe(false);
    expect(automaticScanIsDue(100, 100 + AUTO_SCAN_COOLDOWN_MS)).toBe(true);
  });
});
