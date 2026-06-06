import { describe, it, expect } from "vitest";
import { conflictGate as conflictGateImpl } from "../../docs/research-briefs/_tools/reconcile.js";

// conflictGate(findings) -> string[] of CONFLICT_UNRESOLVED errors.
const conflictGate = conflictGateImpl as unknown as (findings: unknown[]) => string[];

const F = (id: string, status: string, conflict_with: string | string[] | null = null) => ({
  id,
  status,
  conflict_with,
});

describe("conflictGate (a contradiction may ship at most one used member)", () => {
  it("passes when no finding declares a conflict", () => {
    expect(conflictGate([F("E.052", "pending"), F("E.054", "pending")])).toEqual([]);
  });

  it("passes when a contradiction has zero used members", () => {
    expect(conflictGate([F("E.052", "pending", "E.054"), F("E.054", "pending", "E.052")])).toEqual([]);
  });

  it("passes when exactly one member is used and the other rejected", () => {
    expect(
      conflictGate([F("E.052", "used", "E.054"), F("E.054", "rejected:superseded-by-E.052", "E.052")]),
    ).toEqual([]);
  });

  it("FAILS when two contradicting members are both used", () => {
    const errs = conflictGate([F("E.052", "used", "E.054"), F("E.054", "used", "E.052")]);
    expect(errs.some((e) => e.includes("CONFLICT_UNRESOLVED") && e.includes("E.052") && e.includes("E.054"))).toBe(
      true,
    );
  });

  it("detects a >2-member contradiction via transitive links", () => {
    const errs = conflictGate([
      F("X.001", "used", "X.002"),
      F("X.002", "used", ["X.001", "X.003"]),
      F("X.003", "used", "X.002"),
    ]);
    expect(errs.some((e) => e.includes("CONFLICT_UNRESOLVED"))).toBe(true);
  });

  it("is symmetric even if only one side declares the conflict", () => {
    // E.054 names E.052, but E.052 stays silent — still one group, both used -> fail.
    const errs = conflictGate([F("E.052", "used", null), F("E.054", "used", "E.052")]);
    expect(errs.some((e) => e.includes("CONFLICT_UNRESOLVED"))).toBe(true);
  });
});
