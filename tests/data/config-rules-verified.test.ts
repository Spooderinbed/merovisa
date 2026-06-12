import { describe, it, expect } from "vitest";
import { CONFIG_PROVENANCE, CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";

// F16: the verdict card's "Assessment rules verified {date}" floor. The claim
// is "every externally-sourced rule input was verified on or after this date",
// so the constant must be the OLDEST dated provenance entry; internal-heuristic
// entries carry no lastVerified (nothing external to verify) and are excluded.
describe("CONFIG_RULES_VERIFIED (F16)", () => {
  const dated = Object.values(CONFIG_PROVENANCE)
    .map((p) => p.lastVerified)
    .filter((d): d is string => Boolean(d));

  it("derives from at least one dated provenance entry and is an ISO date", () => {
    expect(dated.length).toBeGreaterThan(0);
    expect(CONFIG_RULES_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is the oldest dated entry — no sourced rule input is staler than it", () => {
    expect(CONFIG_RULES_VERIFIED).toBe([...dated].sort()[0]);
    for (const d of dated) expect(CONFIG_RULES_VERIFIED <= d).toBe(true);
  });
});
