import { describe, it, expect } from "vitest";
import { DATA_MODULES } from "@/lib/data/schema/registry";

/**
 * The reconcile walker keys every record's `used_by` off its module's
 * `recordLabel` (a single `Sourced` value becomes `${recordLabel}[0]`). Two
 * modules sharing a `recordLabel` would collide in `used_by`, and because
 * value-fidelity matches a finding's value against the *union* of a record's
 * scalar leaves, one module's number could silently satisfy another module's
 * finding. Lock these identifiers unique so a copy-pasted registry entry fails
 * loudly here as the categories scale, rather than passing a false reconcile.
 */
describe("DATA_MODULES registry integrity", () => {
  it("recordLabel is unique across modules", () => {
    const labels = DATA_MODULES.map((m) => m.recordLabel);
    const dupes = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
    expect(dupes).toEqual([]);
  });

  it("exportName is unique across modules", () => {
    const names = DATA_MODULES.map((m) => m.exportName);
    const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    expect(dupes).toEqual([]);
  });
});
