import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, listAllPlanForUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
  listAllPlanForUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/plan/repo", () => ({ listAllPlanForUser }));
vi.mock("@/components/plan/plan-list-live", () => ({
  PlanListLive: ({ items }: { items: unknown[] }) => <div data-testid="list">{items.length} items</div>,
}));

import PlanPage from "@/app/(app)/plan/page";

describe("/plan page", () => {
  beforeEach(() => {
    getUser.mockReset();
    listAllPlanForUser.mockReset();
  });

  it("renders headline and the plan list", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    listAllPlanForUser.mockResolvedValue([{ id: 1 } as never]);
    const ui = await PlanPage();
    render(ui);
    expect(screen.getByText(/shortest path/i)).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("1 items");
  });
});
