import { describe, expect, it } from "vitest";
import { parseUsagePayload } from "./events";

describe("aggregate usage payload", () => {
  it("accepts only allowlisted bounded integer counts", () => {
    expect(parseUsagePayload({ formatVersion: 1, counts: { "manual-scan": 2, "upgrade-opened": 1 } })).toEqual({ formatVersion: 1, counts: { "manual-scan": 2, "upgrade-opened": 1 } });
    expect(parseUsagePayload({ formatVersion: 1, counts: { "manual-scan": 0 } })).toBeNull();
    expect(parseUsagePayload({ formatVersion: 1, counts: { "manual-scan": 1, domain: "example.test" } })).toBeNull();
    expect(parseUsagePayload({ formatVersion: 1, counts: { "manual-scan": 1.5 } })).toBeNull();
  });
});
