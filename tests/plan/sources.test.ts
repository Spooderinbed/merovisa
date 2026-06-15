import { describe, it, expect } from "vitest";
import { sourcesFor } from "@/lib/plan/sources";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { AU_WORKING_WITH_AGENTS } from "@/lib/data/source/au-working-with-agents";

/**
 * The plan source map (lib/plan/sources.ts) holds LITERAL URLs/dates so it can be
 * imported into the client PlanItemCard without bundling the sourced-config /
 * scoring layer. This test is the single-source-of-truth guard: every literal must
 * equal the canonical sourced data module, so a stale plan link fails here rather
 * than quietly pointing a user at the wrong (or outdated) authority.
 */
describe("plan sources drift guard", () => {
  it("upload-proof-of-funds → DHA living-capacity figure", () => {
    const src = sourcesFor("upload-proof-of-funds")[0]!;
    expect(src.url).toBe(AU_DHA_LIVING_CAPACITY_AUD.provenance.source);
    expect(src.lastVerified).toBe(AU_DHA_LIVING_CAPACITY_AUD.provenance.lastVerified);
  });

  it("prepare-biometrics → VFS Kathmandu biometric collection fee", () => {
    const fee = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!;
    const src = sourcesFor("prepare-biometrics")[0]!;
    expect(src.url).toBe(fee.source);
    expect(src.lastVerified).toBe(fee.lastVerified);
  });

  it("apply-for-noc → MoEST NOC portal", () => {
    const noc = NEPAL_NOC_JOURNEY.find((r) => r.id === "noc-doc-citizenship")!;
    const src = sourcesFor("apply-for-noc")[0]!;
    expect(src.url).toBe(noc.source);
    expect(src.lastVerified).toBe(noc.lastVerified);
  });

  it("verify-agent-marn → OMARA public register", () => {
    const marn = AU_WORKING_WITH_AGENTS.find((r) => r.id === "verify-marn")!;
    const src = sourcesFor("verify-agent-marn")[0]!;
    expect(src.url).toBe(marn.source);
    expect(src.lastVerified).toBe(marn.lastVerified);
  });

  it("season-funds-six-months carries no source (a recommendation, not a published figure)", () => {
    expect(sourcesFor("season-funds-six-months")).toEqual([]);
  });
});
