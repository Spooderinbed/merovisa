import { describe, it, expect } from "vitest";
import { collectFindingRefs } from "../../docs/research-briefs/_tools/reconcile.js";

const banks = [
  {
    id: "himalayan",
    name: "Himalayan Bank Ltd.",
    nrbClass: "A",
    headOffice: "Kamaladi, Kathmandu",
    provenance: { findingRefs: ["B.010"] },
    educationLoan: {
      maxAmountNpr: 10000000,
      maxTenureYears: 15,
      pricing: { kind: "base-spread", minSpreadPct: 0.5, maxSpreadPct: 2.5 },
      provenance: { findingRefs: ["B.011", "B.012"] },
    },
  },
];

describe("collectFindingRefs", () => {
  it("emits one codeRef per provenance-bearing record with its own scalar values", () => {
    const refs = collectFindingRefs(banks, { recordLabel: "banks", subRecordKeys: ["educationLoan"] });

    const bank = refs.find((r) => r.recordPath === "banks[himalayan]");
    expect(bank.findingRefs).toEqual(["B.010"]);
    expect(bank.values).toContain("Himalayan Bank Ltd.");
    expect(bank.values).toContain("Kamaladi, Kathmandu");
    // the loan amount belongs to the sub-record, not the bank
    expect(bank.values).not.toContain(10000000);
  });

  it("emits the sub-record with nested pricing scalars included", () => {
    const refs = collectFindingRefs(banks, { recordLabel: "banks", subRecordKeys: ["educationLoan"] });

    const loan = refs.find((r) => r.recordPath === "banks[himalayan].educationLoan");
    expect(loan.findingRefs).toEqual(["B.011", "B.012"]);
    expect(loan.values).toContain(10000000);
    expect(loan.values).toContain(0.5);
    expect(loan.values).toContain(2.5);
  });

  it("never leaks provenance.findingRefs into values", () => {
    const refs = collectFindingRefs(banks, { recordLabel: "banks", subRecordKeys: ["educationLoan"] });
    for (const r of refs) {
      expect(r.values).not.toContain("B.010");
      expect(r.values).not.toContain("B.011");
    }
  });

  it("emits an empty-provenance codeRef when a record is missing provenance", () => {
    const mod = [{ id: "x", name: "X Bank", nrbClass: "A", headOffice: "Y" }];
    const refs = collectFindingRefs(mod, { recordLabel: "banks", subRecordKeys: [] });
    expect(refs[0].findingRefs).toEqual([]);
    expect(refs[0].recordPath).toBe("banks[x]");
  });
});
