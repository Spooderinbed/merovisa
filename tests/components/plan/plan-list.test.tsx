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

  it("puts visa-prep items under 'Visa preparation' (GS first), leaving non-visa items in 'Your next steps'", () => {
    render(
      <PlanList items={[
        mkKind(1, "prepare-police-certificate", "medium"),
        mkKind(2, "prepare-gs-answers", "high"),
        mkKind(3, "add-grade", "high"),
      ]} />,
    );
    expect(screen.getByText("Visa preparation")).toBeInTheDocument();
    expect(screen.getByText("Your next steps")).toBeInTheDocument();
    expect(screen.getByText(/High impact \(1\)/)).toBeInTheDocument(); // only add-grade; GS moved to visa prep
    const gsTitle = screen.getByText("T2"); // prepare-gs-answers
    const policeTitle = screen.getByText("T1"); // prepare-police-certificate
    expect(gsTitle.compareDocumentPosition(policeTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits 'Visa preparation' when there are no visa-prep items", () => {
    render(<PlanList items={[mkKind(1, "add-grade", "high")]} />);
    expect(screen.queryByText("Visa preparation")).not.toBeInTheDocument();
    expect(screen.getByText("Your next steps")).toBeInTheDocument();
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
