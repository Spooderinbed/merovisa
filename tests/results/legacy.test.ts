import { describe, it, expect } from "vitest";
import { hasLegacyMatchShape } from "@/lib/results/legacy";
import { makeMatchResult } from "../fixtures/catalog";

describe("hasLegacyMatchShape", () => {
  it("flags old university-level matches (no .program) as legacy", () => {
    const legacy = { matches: [{ university: { id: "u0", name: "U" }, matchLevel: "possible", reason: "x" }] };
    expect(hasLegacyMatchShape(legacy as never)).toBe(true);
  });

  it("treats current program-level matches as non-legacy", () => {
    expect(hasLegacyMatchShape({ matches: [makeMatchResult()] })).toBe(false);
  });

  it("treats an empty match list as non-legacy (nothing to render)", () => {
    expect(hasLegacyMatchShape({ matches: [] })).toBe(false);
  });

  it("treats a payload missing its matches array as non-legacy (malformed/minimal)", () => {
    expect(hasLegacyMatchShape({} as never)).toBe(false);
  });
});
