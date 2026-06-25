import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  startedAt: null,
});

const mkKind = (id: number, kind: string, impact: PlanItemRow["impact"]): PlanItemRow => ({
  ...mk(id, impact, "todo"),
  kind,
});

describe("PlanList", () => {
  it("renders empty state when items is []", () => {
    render(<PlanList items={[]} />);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
  });

  it("groups open items into journey phases, in A→E order, and collapses closed", () => {
    render(
      <PlanList
        items={[
          mkKind(1, "prepare-gs-answers", "high"), // Phase D
          mkKind(2, "add-grade", "high"), // Phase A
          mkKind(3, "apply-for-noc", "medium"), // Phase C
          mk(4, "low", "done"),
        ]}
      />,
    );
    const decide = screen.getByText("Decide where to apply");
    const confirm = screen.getByText("Confirm your place");
    const visa = screen.getByText("Prepare your visa");
    expect(decide).toBeInTheDocument();
    expect(confirm).toBeInTheDocument();
    expect(visa).toBeInTheDocument();
    expect(screen.getByText(/Closed \(1\)/)).toBeInTheDocument();
    // Sequence: Decide (A) before Confirm (C) before Prepare your visa (D).
    expect(decide.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(confirm.compareDocumentPosition(visa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits a phase with no open items", () => {
    render(<PlanList items={[mkKind(1, "add-grade", "high")]} />);
    expect(screen.getByText("Decide where to apply")).toBeInTheDocument();
    expect(screen.queryByText("Prepare your visa")).not.toBeInTheDocument();
  });

  it("frames the plan as a guided, ordered journey and points to the checklist as the requirement reference", () => {
    render(<PlanList items={[mkKind(1, "add-grade", "high")]} />);
    expect(screen.getByText(/in the order to tackle them/i)).toBeInTheDocument();
    expect(screen.getByText(/requirement reference/i)).toBeInTheDocument();
    expect(screen.queryByText(/action queue/i)).not.toBeInTheDocument();
  });

  it("shows the guided-plan framing even when the plan is empty", () => {
    render(<PlanList items={[]} />);
    expect(screen.getByText(/in the order to tackle them/i)).toBeInTheDocument();
  });

  it("threads onChanged to item cards so section counts can refresh", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const onChanged = vi.fn();
    render(<PlanList items={[mk(1, "high", "todo")]} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: /^Done$/i }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
