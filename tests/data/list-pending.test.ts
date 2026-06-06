import { describe, it, expect } from "vitest";
import {
  summarize as summarizeImpl,
  pendingInCategory as pendingInCategoryImpl,
} from "../../docs/research-briefs/_tools/list-pending.js";

// list-pending.js is untyped CJS; annotate so strict TS sees the real shapes.
type Finding = Record<string, unknown>;
type CatCounts = { total: number; used: number; pending: number; rejected: number; pendingData: number };
type Summary = {
  total: number;
  used: number;
  pending: number;
  rejected: number;
  byCategory: Record<string, CatCounts>;
};
const summarize = summarizeImpl as unknown as (findings: Finding[]) => Summary;
const pendingInCategory = pendingInCategoryImpl as unknown as (
  findings: Finding[],
  category: string,
) => Array<{ id: string; claim_type: string; value_type: string | null; value_status: string; claim: string }>;

const findings: Finding[] = [
  { id: "A.001", category: "A", status: "pending", claim_type: "data", value_type: "money", value_status: "unset", claim: "fee is X" },
  { id: "A.002", category: "A", status: "used", claim_type: "process", value_type: null, value_status: "prose-only", claim: "must do Y" },
  { id: "A.003", category: "A", status: "rejected:superseded-by:A.004", claim_type: "data", value_type: null, value_status: "unset", claim: "old fee" },
  { id: "B.001", category: "B", status: "pending", claim_type: "contact", value_type: null, value_status: "unset", claim: "call Z" },
];

describe("list-pending summarize", () => {
  it("counts statuses across all findings", () => {
    const s = summarize(findings);
    expect(s.total).toBe(4);
    expect(s.used).toBe(1);
    expect(s.pending).toBe(2);
    expect(s.rejected).toBe(1);
  });

  it("breaks the counts down per category", () => {
    const s = summarize(findings);
    expect(s.byCategory.A).toEqual({ total: 3, used: 1, pending: 1, rejected: 1, pendingData: 1 });
    expect(s.byCategory.B).toEqual({ total: 1, used: 0, pending: 1, rejected: 0, pendingData: 0 });
  });

  it("counts pending data-claims separately (the structured-value integration surface)", () => {
    const s = summarize(findings);
    // A.001 is pending + claim_type:data; B.001 is pending + contact → not counted.
    expect(s.byCategory.A?.pendingData).toBe(1);
    expect(s.byCategory.B?.pendingData).toBe(0);
  });

  it("classifies rejected:<reason> as rejected, not pending", () => {
    const s = summarize([
      { id: "A.003", category: "A", status: "rejected:superseded-by:A.004", claim_type: "data", value_type: null, value_status: "unset", claim: "old" },
    ]);
    expect(s.rejected).toBe(1);
    expect(s.pending).toBe(0);
  });
});

describe("list-pending pendingInCategory", () => {
  it("returns only the pending findings of one category, with display fields", () => {
    const rows = pendingInCategory(findings, "A");
    expect(rows).toEqual([
      { id: "A.001", claim_type: "data", value_type: "money", value_status: "unset", claim: "fee is X" },
    ]);
  });

  it("excludes used and rejected findings", () => {
    const ids = pendingInCategory(findings, "A").map((r) => r.id);
    expect(ids).not.toContain("A.002"); // used
    expect(ids).not.toContain("A.003"); // rejected
  });
});
