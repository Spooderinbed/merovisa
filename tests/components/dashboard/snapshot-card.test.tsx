import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnapshotCard } from "@/components/dashboard/snapshot-card";
import type { AssessmentPayload } from "@/lib/results/types";

const payload: AssessmentPayload = {
  result: {
    verdict: "strong",
    overallScore: 78,
    dimensions: {
      academic:        { score: 80, weight: 0.3, level: "strong", reason: "Grade well above threshold" },
      financial:       { score: 70, weight: 0.25, level: "possible", reason: "Budget covers tuition" },
      visa:            { score: 75, weight: 0.25, level: "strong", reason: "Gap explained" },
      profileStrength: { score: 80, weight: 0.2, level: "strong", reason: "Work experience" },
    },
    ruleVersion: "v0.1.0",
  },
  destination: { name: "Australia", flag: "🇦🇺" },
  intake: { nextName: "February", nextMonth: 2, deadlineIso: "2026-10-15", weeksAway: 18 },
  matches: [], matchedCount: 6, accuracy: { pct: 60 },
} as unknown as AssessmentPayload;

describe("SnapshotCard", () => {
  it("renders the verdict label and the destination", () => {
    render(<SnapshotCard primary={payload} destinationLabel="Australia" />);
    expect(screen.getByText(/Strong match/i)).toBeInTheDocument();
    expect(screen.getByText(/Australia/i)).toBeInTheDocument();
  });

  it("renders a 'Run your first assessment' empty state when payload is null", () => {
    render(<SnapshotCard primary={null} destinationLabel={null} />);
    expect(screen.getByText(/Run your first assessment/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check eligibility/i })).toHaveAttribute("href", "/assess");
  });
});
