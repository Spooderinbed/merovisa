import { describe, it, expect } from "vitest";
import { reconcileCore as reconcileCoreImpl } from "../../docs/research-briefs/_tools/reconcile.js";

// reconcile.js is untyped CJS; annotate the real fn so strict TS sees errors: string[].
type ReconcileResult = { errors: string[]; report: { total: number; used: number; referenced: number } };
const reconcileCore = reconcileCoreImpl as unknown as (args: {
  findings: unknown[];
  codeRefs: unknown[];
  exempt?: { provenanceExemptInterfaces?: string[]; findingExemptIds?: string[] };
}) => ReconcileResult;

// Helper: a `used` finding with sensible defaults.
const used = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "used",
  entity: "",
  attribute: "",
  value: null,
  value_type: null,
  unit: null,
  value_status: "prose-only",
  ...extra,
});

describe("reconcileCore", () => {
  it("passes when refs, status, and values all line up", () => {
    const findings = [
      used("B.001", { value_status: "structured", value: 2000, value_type: "money", unit: "AUD" }),
    ];
    const codeRefs = [{ recordPath: "banks[0]", findingRefs: ["B.001"], values: [2000] }];
    expect(reconcileCore({ findings, codeRefs }).errors).toEqual([]);
  });

  it("(a) flags a used finding referenced by no code record", () => {
    const findings = [used("B.001")];
    const { errors } = reconcileCore({ findings, codeRefs: [] });
    expect(errors.some((e) => e.includes("ORPHAN_USED") && e.includes("B.001"))).toBe(true);
  });

  it("(b) flags a ref to a missing finding", () => {
    const codeRefs = [{ recordPath: "banks[0]", findingRefs: ["B.999"], values: [] }];
    expect(
      reconcileCore({ findings: [], codeRefs }).errors.some((e) => e.includes("DANGLING_REF")),
    ).toBe(true);
  });

  it("(b) flags a ref to a non-used finding", () => {
    const findings = [
      { id: "B.002", status: "pending", value: null, value_type: null, unit: null, value_status: "unset" },
    ];
    const codeRefs = [{ recordPath: "banks[0]", findingRefs: ["B.002"], values: [] }];
    expect(
      reconcileCore({ findings, codeRefs }).errors.some((e) => e.includes("REF_NOT_USED")),
    ).toBe(true);
  });

  it("(c) flags value drift for a structured finding", () => {
    const findings = [
      used("B.001", { value_status: "structured", value: 2000, value_type: "money", unit: "AUD" }),
    ];
    const codeRefs = [{ recordPath: "banks[0]", findingRefs: ["B.001"], values: [9999] }];
    expect(
      reconcileCore({ findings, codeRefs }).errors.some((e) => e.includes("VALUE_DRIFT")),
    ).toBe(true);
  });

  it("(c) treats 2000.00 and 2000 as the same money value", () => {
    const findings = [
      used("B.001", { value_status: "structured", value: 2000.0, value_type: "money", unit: "AUD" }),
    ];
    const codeRefs = [{ recordPath: "banks[0]", findingRefs: ["B.001"], values: [2000] }];
    expect(reconcileCore({ findings, codeRefs }).errors).toEqual([]);
  });

  it("(c) requires BOTH bounds of a range value to be present", () => {
    const findings = [
      used("B.003", { value_status: "structured", value: { min: 1, max: 10 }, value_type: "number", unit: "years" }),
    ];
    expect(
      reconcileCore({ findings, codeRefs: [{ recordPath: "loan", findingRefs: ["B.003"], values: [1, 10] }] }).errors,
    ).toEqual([]);
    expect(
      reconcileCore({ findings, codeRefs: [{ recordPath: "loan", findingRefs: ["B.003"], values: [1] }] }).errors.some(
        (e) => e.includes("VALUE_DRIFT"),
      ),
    ).toBe(true);
  });

  it("(c) matches string values tolerant of whitespace and case", () => {
    const findings = [
      used("B.004", { value_status: "structured", value: "New Road, Kathmandu", value_type: "string" }),
    ];
    const codeRefs = [{ recordPath: "bank", findingRefs: ["B.004"], values: ["New Road,  KATHMANDU"] }];
    expect(reconcileCore({ findings, codeRefs }).errors).toEqual([]);
  });

  it("(c) matches enum values exactly (case-sensitive)", () => {
    const findings = [used("B.006", { value_status: "structured", value: "A", value_type: "enum" })];
    expect(
      reconcileCore({ findings, codeRefs: [{ recordPath: "bank", findingRefs: ["B.006"], values: ["A"] }] }).errors,
    ).toEqual([]);
    expect(
      reconcileCore({ findings, codeRefs: [{ recordPath: "bank", findingRefs: ["B.006"], values: ["a"] }] }).errors.some(
        (e) => e.includes("VALUE_DRIFT"),
      ),
    ).toBe(true);
  });

  it("flags a used finding left unset (must declare a structured value or prose-only)", () => {
    const findings = [
      { id: "B.005", status: "used", value: null, value_type: null, unit: null, value_status: "unset" },
    ];
    const codeRefs = [{ recordPath: "bank", findingRefs: ["B.005"], values: [] }];
    expect(
      reconcileCore({ findings, codeRefs }).errors.some((e) => e.includes("USED_UNSET")),
    ).toBe(true);
  });

  it("flags an empty-provenance record unless its interface is exempt", () => {
    expect(
      reconcileCore({
        findings: [],
        codeRefs: [{ recordPath: "field[0]", interface: "FieldOfStudyData", findingRefs: [], values: [] }],
        exempt: { provenanceExemptInterfaces: ["FieldOfStudyData"] },
      }).errors,
    ).toEqual([]);
    expect(
      reconcileCore({
        findings: [],
        codeRefs: [{ recordPath: "bank[0]", interface: "NepalBank", findingRefs: [], values: [] }],
      }).errors.some((e) => e.includes("MISSING_PROVENANCE")),
    ).toBe(true);
  });
});
