import { describe, it, expect } from "vitest";
import { attachNepalEvidence } from "@/lib/matches/evidence";
import { AU_NEPAL_EVIDENCE_SOURCE } from "@/lib/data/source/au-nepal-evidence-levels";
import { makeMatchResult, TEST_UNIVERSITIES } from "../fixtures/catalog";
import type { MatchResult } from "@/lib/matches/types";

/** A match whose only change from the fixture is its catalogue university id. */
const withUniId = (id: string): MatchResult =>
  makeMatchResult({ university: { ...TEST_UNIVERSITIES[0]!, id } });

describe("attachNepalEvidence", () => {
  it("attaches the sourced Nepal evidence level for a resolvable catalogue university", () => {
    // University of Sydney → CRICOS 00026A → Streamlined (study-type 01), verified in the source data.
    const [m] = attachNepalEvidence([withUniId("sydney")]);
    expect(m!.evidence).toEqual({ level: "Streamlined", source: AU_NEPAL_EVIDENCE_SOURCE });
  });

  it("leaves a match with no evidence when its university does not resolve to a CRICOS provider", () => {
    // The test-fixture ids (u-melb/u-uts) are not catalogue ids, so they don't resolve.
    const [m] = attachNepalEvidence([withUniId("u-melb")]);
    expect(m!.evidence).toBeUndefined();
  });

  it("preserves the rest of the match unchanged", () => {
    const input = withUniId("sydney");
    const [out] = attachNepalEvidence([input]);
    expect(out!.program).toBe(input.program);
    expect(out!.verdict).toBe(input.verdict);
    expect(out!.reasons).toBe(input.reasons);
  });
});
