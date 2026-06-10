import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanItemCard } from "@/components/plan/plan-item-card";
import type { PlanItemRow } from "@/lib/plan/types";

const item: PlanItemRow = {
  id: 1,
  owner: "u1",
  kind: "k",
  impact: "high",
  title: "Upload IELTS",
  body: "Body",
  liftEstimate: "Unlocks 3 matches",
  timeEstimate: "2 minutes",
  status: "todo",
  createdAt: "2026-06-04",
  completedAt: null,
  startedAt: null,
};

describe("PlanItemCard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders title, body, lift + time estimates, and impact pill", () => {
    render(<PlanItemCard item={item} />);
    expect(screen.getByText("Upload IELTS")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText(/Unlocks 3 matches/)).toBeInTheDocument();
    expect(screen.getByText(/2 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/High impact/i)).toBeInTheDocument();
  });

  it("POSTs status=done on Done click", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<PlanItemCard item={item} />);
    await userEvent.click(screen.getByRole("button", { name: /Done/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plan/action",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ id: 1, status: "done" });
  });

  it("shows Undo when item starts as done", () => {
    render(<PlanItemCard item={{ ...item, status: "done" }} />);
    expect(screen.getByRole("button", { name: /Undo/i })).toBeInTheDocument();
  });
});
