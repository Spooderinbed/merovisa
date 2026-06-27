import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanItemCard } from "@/components/plan/plan-item-card";
import type { PlanItemRow } from "@/lib/plan/types";

vi.mock("@/lib/analytics/events", () => ({ track: vi.fn() }));

let nextId = 1;
const row = (kind: string, extra?: Partial<PlanItemRow>): PlanItemRow => ({
  id: nextId++, owner: "u1", kind, impact: "medium", title: "An action", body: null,
  liftEstimate: null, timeEstimate: null, status: "todo", createdAt: "2026-06-01T00:00:00Z",
  completedAt: null, startedAt: null, ...extra,
});

describe("PlanItemCard — checklist-stage tag (reverse Plan→Checklist link)", () => {
  it("tags an after-offer checklist requirement", () => {
    render(<PlanItemCard item={row("apply-for-noc")} />);
    expect(screen.getByText(/checklist.*after offer/i)).toBeInTheDocument();
  });

  it("tags a now-stage checklist requirement", () => {
    render(<PlanItemCard item={row("verify-agent-marn")} />);
    expect(screen.getByText(/checklist.*\bnow\b/i)).toBeInTheDocument();
  });

  it("shows no checklist tag for a plan action that mirrors no checklist requirement", () => {
    render(<PlanItemCard item={row("prepare-health-exam")} />);
    expect(screen.queryByText(/checklist/i)).toBeNull();
  });

  it("keeps the tag on a closed (done) card — it is a classification, not a live state", () => {
    render(<PlanItemCard item={row("apply-for-noc", { status: "done" })} />);
    expect(screen.getByText(/checklist.*after offer/i)).toBeInTheDocument();
  });
});
