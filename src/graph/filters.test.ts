import { describe, expect, it } from "vitest";
import { defaultEnabledTypes } from "@/src/graph/filters";
import { CONNECTION_TYPES } from "@/src/types/graph";

describe("graph defaults", () => {
  it("shows every connection type on first open", () => {
    const enabled = defaultEnabledTypes();
    for (const type of CONNECTION_TYPES) expect(enabled[type]).toBe(true);
  });
});
