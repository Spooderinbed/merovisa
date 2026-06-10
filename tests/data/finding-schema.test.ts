import { describe, it, expect } from "vitest";
import { FINDING_FIELDS, TRIAGE, validateFinding } from "../../docs/research-briefs/_tools/finding-schema.js";

const base = {
  id: "B.045",
  topic: "B",
  category: "B",
  claim: "Himalayan Bank offers education loans up to NPR 10,000,000.",
  entity: "Himalayan Bank",
  attribute: "education loan amount",
  source: "https://himalayanbank.com/education-loan",
  publisher: "bank",
  source_date: "2026-01",
  confidence: "primary",
  claim_type: "data",
  caveats: "",
  target: "lib/data/source/nepal-banks.ts",
  conflict_with: null,
  dup_group: null,
  status: "pending",
  value: null,
  value_type: null,
  unit: null,
  value_status: "unset",
};

describe("validateFinding", () => {
  it("accepts a well-formed finding", () => {
    expect(validateFinding(base)).toEqual([]);
  });

  it("flags a malformed id", () => {
    expect(validateFinding({ ...base, id: "b.4" }).length).toBeGreaterThan(0);
  });

  it("accepts a two-part topic id like J1.001", () => {
    expect(validateFinding({ ...base, id: "J1.001", topic: "J1", category: "J" })).toEqual([]);
  });

  it("flags an unknown confidence", () => {
    expect(validateFinding({ ...base, confidence: "rumor" }).length).toBeGreaterThan(0);
  });

  it("flags an unknown status", () => {
    expect(validateFinding({ ...base, status: "maybe" }).length).toBeGreaterThan(0);
  });

  it("accepts a rejected:<reason> status", () => {
    expect(validateFinding({ ...base, status: "rejected:superseded-by:B.099" })).toEqual([]);
  });

  it("flags a missing required field", () => {
    const { status, ...missing } = base;
    void status;
    expect(validateFinding(missing).length).toBeGreaterThan(0);
  });

  it("requires value + value_type when value_status is structured", () => {
    expect(validateFinding({ ...base, value_status: "structured" }).length).toBeGreaterThan(0);
    expect(
      validateFinding({
        ...base,
        value_status: "structured",
        value: 10000000,
        value_type: "money",
        unit: "NPR",
      }),
    ).toEqual([]);
  });

  it("flags an unknown value_status", () => {
    expect(validateFinding({ ...base, value_status: "guessed" }).length).toBeGreaterThan(0);
  });

  it("accepts a valid cluster_triage label", () => {
    expect(validateFinding({ ...base, cluster_triage: "enumeration" })).toEqual([]);
    expect(validateFinding({ ...base, cluster_triage: "contradiction" })).toEqual([]);
    expect(validateFinding({ ...base, cluster_triage: "duplicate" })).toEqual([]);
  });

  it("treats cluster_triage as optional (absent is fine)", () => {
    expect(validateFinding(base)).toEqual([]);
  });

  it("flags an unknown cluster_triage label", () => {
    expect(validateFinding({ ...base, cluster_triage: "maybe-dupe" }).length).toBeGreaterThan(0);
  });

  it("exposes the canonical field list", () => {
    expect(FINDING_FIELDS).toContain("id");
    expect(FINDING_FIELDS).toContain("value_status");
  });
});

describe("validateFinding — human-owned triage fields", () => {
  it("accepts each triage value on a pending finding when a reason is given", () => {
    for (const t of ["ready", "use-later", "needs-human-call", "stale"]) {
      expect(
        validateFinding({ ...base, triage: t, triage_reason: "ranked in phase-2 cluster triage" }),
      ).toEqual([]);
    }
  });

  it("treats triage as optional (absent is fine)", () => {
    expect(validateFinding(base)).toEqual([]);
  });

  it("flags an unknown triage value", () => {
    expect(validateFinding({ ...base, triage: "later-maybe", triage_reason: "x" }).length).toBeGreaterThan(0);
  });

  it("requires a non-empty triage_reason when triage is set", () => {
    expect(validateFinding({ ...base, triage: "ready" }).length).toBeGreaterThan(0);
    expect(validateFinding({ ...base, triage: "ready", triage_reason: "   " }).length).toBeGreaterThan(0);
  });

  it("flags an orphan triage_reason (reason without triage)", () => {
    expect(validateFinding({ ...base, triage_reason: "left behind" }).length).toBeGreaterThan(0);
  });

  it("rejects triage on a used finding — clear it when integrating", () => {
    const used = { ...base, status: "used", value_status: "prose-only", triage: "ready", triage_reason: "r" };
    expect(validateFinding(used).some((e) => e.includes("non-pending"))).toBe(true);
  });

  it("rejects triage on a rejected finding — rejected:<reason> already carries the decision", () => {
    const rejected = { ...base, status: "rejected:superseded", triage: "stale", triage_reason: "r" };
    expect(validateFinding(rejected).some((e) => e.includes("non-pending"))).toBe(true);
  });

  it("exposes the triage vocabulary", () => {
    expect([...TRIAGE].sort()).toEqual(["needs-human-call", "ready", "stale", "use-later"]);
  });
});
