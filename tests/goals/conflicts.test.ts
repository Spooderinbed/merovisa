import { describe, it, expect } from "vitest";
import { goalTradeoffNote } from "@/lib/goals/conflicts";
import type { Goal } from "@/lib/scoring/types";

describe("goalTradeoffNote — honest, inert goal trade-off note", () => {
  it("returns null when there is no primary goal", () => {
    expect(goalTradeoffNote(null, ["highest-ranked"])).toBeNull();
  });

  it("returns null when there are no secondary goals", () => {
    expect(goalTradeoffNote("permanent-residency", undefined)).toBeNull();
    expect(goalTradeoffNote("permanent-residency", [])).toBeNull();
  });

  it("returns null when no secondary tensions with the primary", () => {
    // research + best-employment is not a v1 tension pair
    expect(goalTradeoffNote("research", ["best-employment"])).toBeNull();
  });

  it("fires for permanent-residency (primary) + highest-ranked (secondary)", () => {
    const note = goalTradeoffNote("permanent-residency", ["highest-ranked"]);
    expect(note).not.toBeNull();
    expect(note?.kind).toBe("tension");
    expect(note?.primary).toBe("permanent-residency");
    expect(note?.secondary).toBe("highest-ranked");
    expect(note?.text.length).toBeGreaterThan(0);
  });

  it("fires symmetrically when the roles are reversed", () => {
    // primary = highest-ranked, secondary = permanent-residency → same pair
    const note = goalTradeoffNote("highest-ranked", ["permanent-residency"]);
    expect(note?.secondary).toBe("permanent-residency");
    expect(note?.text).toContain("Permanent residency");
  });

  it("fires for lowest-cost + highest-ranked", () => {
    const note = goalTradeoffNote("lowest-cost", ["highest-ranked"]);
    expect(note?.primary).toBe("lowest-cost");
    expect(note?.secondary).toBe("highest-ranked");
  });

  it("returns the higher-priority pair when several tension", () => {
    // primary = highest-ranked; secondaries include BOTH pr and lowest-cost.
    // pr↔ranked outranks cost↔ranked → the pr pair wins.
    const note = goalTradeoffNote("highest-ranked", [
      "lowest-cost",
      "permanent-residency",
    ]);
    expect(note?.secondary).toBe("permanent-residency");
  });

  it("is pure — does not mutate its inputs and is deterministic", () => {
    const secondaries: Goal[] = ["highest-ranked"];
    const a = goalTradeoffNote("permanent-residency", secondaries);
    const b = goalTradeoffNote("permanent-residency", secondaries);
    expect(a).toEqual(b);
    expect(secondaries).toEqual(["highest-ranked"]);
  });
});
