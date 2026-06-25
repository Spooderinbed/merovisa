import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlanItemRow } from "@/lib/plan/types";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { PlanListLive } from "@/components/plan/plan-list-live";

const item: PlanItemRow = {
  id: 1,
  owner: "u1",
  kind: "k1",
  impact: "high",
  title: "T1",
  body: null,
  liftEstimate: null,
  timeEstimate: null,
  status: "todo",
  createdAt: "2026-06-10",
  completedAt: null,
  startedAt: null,
};

describe("PlanListLive", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("renders the plan list", () => {
    render(<PlanListLive items={[item]} />);
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("Decide where to apply")).toBeInTheDocument();
  });

  it("refreshes server data after a successful item action (live section counts)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<PlanListLive items={[item]} />);
    await userEvent.click(screen.getByRole("button", { name: /^Done$/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the action fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    render(<PlanListLive items={[item]} />);
    await userEvent.click(screen.getByRole("button", { name: /^Done$/i }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
