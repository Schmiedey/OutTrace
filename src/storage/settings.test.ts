import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./database";
import { claimFreeDeepAudit, hasUsedFreeDeepAudit } from "./settings";

beforeEach(async () => { await db.open(); });
afterEach(async () => { await db.delete(); });

describe("complimentary deep audit", () => {
  it("can only be claimed once per installation", async () => {
    expect(await hasUsedFreeDeepAudit()).toBe(false);
    expect(await claimFreeDeepAudit()).toBe(true);
    expect(await hasUsedFreeDeepAudit()).toBe(true);
    expect(await claimFreeDeepAudit()).toBe(false);
  });
});
