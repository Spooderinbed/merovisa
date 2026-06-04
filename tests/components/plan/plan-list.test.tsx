import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanList } from "@/components/plan/plan-list";
import type { PlanItemRow } from "@/lib/plan/types";

const mk = (
  id: number,
  impact: PlanItemRow["impact"],
  status: PlanItemRow["status"],
): PlanItemRow => ({
  id,
  owner: "u1",
  kind: `k${id}`,
  impact,
  title: `T${id}`,
  body: null,
  liftEstimate: null,
  timeEstimate: null,
  status,
  createdAt: "2026-06-04",
  completedAt: null,
});

describe("PlanList", () => {
  it("renders empty state when items is []", () => {
    render(<PlanList items={[]} />);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
  });

  it("groups open items by impact and collapses closed", () => {
    render(
      <PlanList
        items={[mk(1, "high", "todo"), mk(2, "medium", "todo"), mk(3, "low", "done")]}
      />,
    );
    expect(screen.getByText(/High impact \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Medium impact \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Closed \(1\)/)).toBeInTheDocument();
  });
});
