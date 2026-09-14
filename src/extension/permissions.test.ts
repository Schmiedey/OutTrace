import { describe, expect, it } from "vitest";
import { canScanUrl, explainScanBlock } from "@/src/extension/permissions";

describe("scan eligibility", () => {
  it.each(["about:blank", "chrome://newtab/", "edge://newtab/", "chrome-extension://abc/app.html"])(
    "blocks restricted page %s",
    (url) => expect(canScanUrl(url)).toBe(false),
  );

  it("gives a visible recovery message for blank and new tabs", () => {
    expect(explainScanBlock("about:blank")).toContain("regular website");
    expect(explainScanBlock(undefined)).toContain("regular website");
  });
});
