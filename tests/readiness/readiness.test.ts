import { describe, it, expect } from "vitest";
import { buildReadiness, type ReadinessSignals } from "@/lib/readiness/readiness";

type Influence = "positive" | "neutral" | "risk";
const f = (influence: Influence, label: string) => ({ label, influence, detail: `${label} — detail` });
const dim = (factors: Array<{ label: string; influence: Influence; detail: string }>) => ({ value: 0, factors });

/** A fully-assessed baseline; individual tests override one dimension. */
function signals(over: Partial<ReadinessSignals> = {}): ReadinessSignals {
  return {
    dimensions: {
      academic: dim([f("positive", "Strong grade")]),
      financial: dim([f("positive", "Budget above typical range")]),
      visa: dim([f("positive", "No prior refusals")]),
    },
    profilePct: 80,
    documentCount: 0,
    ...over,
  };
}

const rowByKey = (s: ReadinessSignals, key: string) =>
  buildReadiness(s).rows.find((r) => r.key === key)!;

describe("buildReadiness", () => {
  it("returns exactly four rows in a fixed order", () => {
    const { rows } = buildReadiness(signals());
    expect(rows.map((r) => r.key)).toEqual(["academics", "money", "visa", "documents"]);
  });

  it("flags a dimension that has a risk factor as at-risk, surfacing that factor", () => {
    const s = signals({
      dimensions: {
        academic: dim([f("positive", "Master's degree completed"), f("risk", "Grade below threshold")]),
        financial: dim([f("positive", "Budget above typical range")]),
        visa: dim([f("positive", "No prior refusals")]),
      },
    });
    const row = rowByKey(s, "academics");
    expect(row.band).toBe("risk");
    expect(row.why).toBe("Grade below threshold");
  });

  it("bands a dimension with only positive factors as strong", () => {
    const row = rowByKey(signals(), "money");
    expect(row.band).toBe("strong");
    expect(row.why).toBe("Budget above typical range");
  });

  it("bands a dimension with a neutral (improvable) factor and no risk as needs-work", () => {
    const s = signals({
      dimensions: {
        academic: dim([f("positive", "Strong grade")]),
        financial: dim([f("positive", "Budget within typical range"), f("neutral", "Self-funded")]),
        visa: dim([f("positive", "No prior refusals")]),
      },
    });
    const row = rowByKey(s, "money");
    expect(row.band).toBe("needs-work");
    expect(row.why).toBe("Self-funded");
  });

  it("treats a present-but-unscored dimension (no factors) as add-detail to the profile", () => {
    const s = signals({
      dimensions: {
        academic: dim([]),
        financial: dim([f("positive", "Budget above typical range")]),
        visa: dim([f("positive", "No prior refusals")]),
      },
    });
    const row = rowByKey(s, "academics");
    expect(row.band).toBe("add-detail");
    expect(row.href).toBe("/profile");
    expect(row.why).toBe("Add more detail to assess this");
  });

  it("renders all three dimension rows as add-detail to the wizard when there is no assessment", () => {
    const s = signals({ dimensions: null });
    const { rows } = buildReadiness(s);
    for (const key of ["academics", "money", "visa"]) {
      const row = rows.find((r) => r.key === key)!;
      expect(row.band).toBe("add-detail");
      expect(row.href).toBe("/assess");
      expect(row.why).toBe("Take the assessment to see this");
    }
    // documents is still honest, never gated behind the assessment
    expect(rows.find((r) => r.key === "documents")!.band).toBe("not-started");
  });

  it("marks documents not-started at zero", () => {
    const row = rowByKey(signals({ documentCount: 0 }), "documents");
    expect(row.band).toBe("not-started");
    expect(row.why).toBe("No documents uploaded yet");
    expect(row.href).toBe("/documents");
  });

  it("marks documents in-progress above zero and never strong", () => {
    const row = rowByKey(signals({ documentCount: 3 }), "documents");
    expect(row.band).toBe("in-progress");
    expect(row.why).toContain("3");
    expect(row.why).toMatch(/uploaded/i);
    expect(row.band).not.toBe("strong");
  });

  it("passes completenessPct through to the header value", () => {
    expect(buildReadiness(signals({ profilePct: 42 })).completenessPct).toBe(42);
  });

  it("links each assessed dimension row to where the student acts", () => {
    const map = Object.fromEntries(buildReadiness(signals()).rows.map((r) => [r.key, r.href]));
    expect(map.academics).toBe("/profile");
    expect(map.money).toBe("/profile");
    expect(map.visa).toBe("/profile");
    expect(map.documents).toBe("/documents");
  });

  it("names every band by word in the aria label, implying no unearned band", () => {
    const s = signals({
      dimensions: {
        academic: dim([f("positive", "Strong grade")]),
        financial: dim([f("neutral", "Self-funded")]),
        visa: dim([f("risk", "Prior visa refusal")]),
      },
      documentCount: 2,
    });
    const { ariaLabel } = buildReadiness(s);
    expect(ariaLabel).toContain("Academics & English: strong");
    expect(ariaLabel).toContain("Money & funding: needs work");
    expect(ariaLabel).toContain("Visa readiness: at risk");
    expect(ariaLabel).toContain("Documents: in progress");
  });

  it("never puts a percentage into any row label or why", () => {
    const { rows } = buildReadiness(signals({ profilePct: 73, documentCount: 5 }));
    for (const row of rows) {
      expect(row.label).not.toContain("%");
      expect(row.why ?? "").not.toContain("%");
    }
  });
});
