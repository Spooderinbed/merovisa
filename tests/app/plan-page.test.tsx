import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, listAllPlanForCase } = vi.hoisted(() => ({
  getUser: vi.fn(),
  listAllPlanForCase: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/plan/repo", () => ({ listAllPlanForCase }));
vi.mock("@/components/plan/plan-list-live", () => ({
  PlanListLive: ({ items }: { items: unknown[] }) => <div data-testid="list">{items.length} items</div>,
}));

// MV-157: every migrated route and page resolves the actor's personal case and
// authorizes it before its first query. Both are mocked to the happy path here;
// the denial branch is asserted where the route owns it.
const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
beforeEach(() => {
  resolvePersonalCaseId.mockResolvedValue("case-1");
  ensurePersonalCase.mockResolvedValue("case-1");
  checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
});

import PlanPage from "@/app/(app)/(student)/plan/page";

describe("/plan page", () => {
  beforeEach(() => {
    getUser.mockReset();
    listAllPlanForCase.mockReset();
  });

  it("renders headline and the plan list", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    listAllPlanForCase.mockResolvedValue([{ id: 1 } as never]);
    const ui = await PlanPage();
    render(ui);
    expect(screen.getByText(/shortest path/i)).toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("1 items");
    // MV-05: the not-immigration-advice boundary rides above the plan.
    expect(screen.getByText(/not immigration advice/i)).toBeInTheDocument();
  });
});
