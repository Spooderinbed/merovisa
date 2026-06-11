import { describe, it, expect } from "vitest";
import {
  computeFlips as impl,
  applyChange as applyChangeImpl,
} from "../../docs/research-briefs/_tools/flip-status.js";

// flip-status.js is untyped CJS; annotate the real fn so strict TS sees the shapes.
type Finding = Record<string, unknown>;
type Report = {
  promoted: string[];
  demoted: string[];
  refused: string[];
  refToRejected: string[];
  rewired: string[];
};
type Change = { status: string; used_by?: string[] };
type Result = { report: Report; changedById: Record<string, Change> };
const computeFlips = impl as unknown as (a: {
  findings: Finding[];
  usedBy: Record<string, string[]>;
}) => Result;
const applyChange = applyChangeImpl as unknown as (finding: Finding, change: Change) => Finding;

describe("flip-status computeFlips", () => {
  it("promotes a referenced pending finding to used, with used_by from code", () => {
    const findings = [{ id: "B.001", status: "pending", conflict_with: null }];
    const r = computeFlips({ findings, usedBy: { "B.001": ["banks[0]"] } });
    expect(r.report.promoted).toEqual(["B.001"]);
    expect(r.changedById["B.001"]).toEqual({ status: "used", used_by: ["banks[0]"] });
  });

  it("self-heals: demotes a used finding that code no longer references", () => {
    const findings = [{ id: "B.001", status: "used", used_by: ["banks[0]"], conflict_with: null }];
    const r = computeFlips({ findings, usedBy: {} });
    expect(r.report.demoted).toEqual(["B.001"]);
    expect(r.changedById["B.001"]?.status).toBe("pending");
  });

  it("leaves an already-used, still-referenced finding untouched", () => {
    const findings = [{ id: "B.001", status: "used", used_by: ["banks[0]"], conflict_with: null }];
    const r = computeFlips({ findings, usedBy: { "B.001": ["banks[0]"] } });
    expect(r.report.promoted).toEqual([]);
    expect(r.report.demoted).toEqual([]);
    expect(r.report.rewired).toEqual([]);
    expect(r.changedById["B.001"]).toBeUndefined();
  });

  it("rewires used_by when code references change", () => {
    const findings = [{ id: "B.001", status: "used", used_by: ["banks[0]"], conflict_with: null }];
    const r = computeFlips({ findings, usedBy: { "B.001": ["banks[0]", "banks[0].educationLoan"] } });
    expect(r.report.rewired).toEqual(["B.001"]);
    expect(r.changedById["B.001"]).toEqual({
      status: "used",
      used_by: ["banks[0]", "banks[0].educationLoan"],
    });
  });

  it("rewires a legacy non-array used_by (a bare string) into the code-derived array", () => {
    const findings = [{ id: "B.028", status: "used", used_by: "nepal-banks.ts", conflict_with: null }];
    const r = computeFlips({ findings, usedBy: { "B.028": ["banks[himalayan-bank].educationLoan"] } });
    expect(r.report.rewired).toEqual(["B.028"]);
    expect(r.changedById["B.028"]).toEqual({
      status: "used",
      used_by: ["banks[himalayan-bank].educationLoan"],
    });
  });

  it("refuses to flip members of an unresolved contradiction (both referenced)", () => {
    const findings = [
      { id: "A.100", status: "pending", conflict_with: ["A.101"] },
      { id: "A.101", status: "pending", conflict_with: ["A.100"] },
    ];
    const r = computeFlips({ findings, usedBy: { "A.100": ["x"], "A.101": ["y"] } });
    expect(r.report.refused.slice().sort()).toEqual(["A.100", "A.101"]);
    expect(r.report.promoted).toEqual([]);
    expect(r.changedById["A.100"]).toBeUndefined();
    expect(r.changedById["A.101"]).toBeUndefined();
  });

  it("allows promotion once the contradiction is resolved (loser rejected)", () => {
    const findings = [
      { id: "A.100", status: "pending", conflict_with: ["A.101"] },
      { id: "A.101", status: "rejected:superseded-by:A.100", conflict_with: ["A.100"] },
    ];
    const r = computeFlips({ findings, usedBy: { "A.100": ["x"] } });
    expect(r.report.promoted).toEqual(["A.100"]);
    expect(r.report.refused).toEqual([]);
  });

  it("never promotes a rejected finding that code still references — reports it", () => {
    const findings = [{ id: "A.100", status: "rejected:superseded-by:A.101", conflict_with: null }];
    const r = computeFlips({ findings, usedBy: { "A.100": ["x"] } });
    expect(r.report.refToRejected).toEqual(["A.100"]);
    expect(r.report.promoted).toEqual([]);
    expect(r.changedById["A.100"]).toBeUndefined();
  });
});

describe("applyChange (JSONL row rewrite)", () => {
  it("clears triage + triage_reason when a finding is promoted to used", () => {
    const out = applyChange(
      { id: "X.1", status: "pending", claim: "c", triage: "ready", triage_reason: "r" },
      { status: "used", used_by: ["au-genuine-student[0]"] },
    );
    expect(out.status).toBe("used");
    expect(out.used_by).toEqual(["au-genuine-student[0]"]);
    expect("triage" in out).toBe(false);
    expect("triage_reason" in out).toBe(false);
    expect(out.claim).toBe("c"); // untouched fields survive
  });

  it("removes used_by on demotion and never resurrects triage", () => {
    const out = applyChange({ id: "X.2", status: "used", used_by: ["m"] }, { status: "pending" });
    expect(out.status).toBe("pending");
    expect("used_by" in out).toBe(false);
    expect("triage" in out).toBe(false);
  });
});
