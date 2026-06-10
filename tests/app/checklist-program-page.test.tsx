import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PlanItemRow } from "@/lib/plan/types";

vi.mock("server-only", () => ({}));

const { getUser, getProgram, listAllUniversities, getProfile, listDocumentsForUser, listAllPlanForUser } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getProgram: vi.fn(),
    listAllUniversities: vi.fn(),
    getProfile: vi.fn(),
    listDocumentsForUser: vi.fn(),
    listAllPlanForUser: vi.fn(),
  }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/programs/repo", () => ({ getProgram, listAllUniversities }));
vi.mock("@/lib/profiles/repo", () => ({ getProfile }));
vi.mock("@/lib/documents/repo", () => ({ listDocumentsForUser }));
vi.mock("@/lib/plan/repo", () => ({ listAllPlanForUser }));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/components/checklist/checklist-view", () => ({
  ChecklistView: ({ planStates }: { planStates?: Record<string, string> }) => (
    <div data-testid="view">{JSON.stringify(planStates ?? null)}</div>
  ),
}));

import ProgramChecklistPage from "@/app/(app)/checklist/[programId]/page";

const program = {
  id: "p1", universityId: "u1", name: "Master of IT", level: "masters",
  field: "computer-science", tuitionMin: 40000, tuitionMax: 45000, tuitionCurrency: "AUD",
  minGrade: 65, minEnglish: 6.5, minEnglishBand: 6, intakes: ["feb"],
  source: "https://example.edu/it", lastVerified: "2026-01-01", dataQuality: "primary", notes: null,
};

let nextId = 1;
const planRow = (kind: string, status: PlanItemRow["status"], startedAt: string | null = null): PlanItemRow => ({
  id: nextId++, owner: "u1", kind, impact: "medium", title: "t", body: null,
  liftEstimate: null, timeEstimate: null, status, createdAt: "2026-06-01T00:00:00Z",
  completedAt: null, startedAt,
});

describe("/checklist/[programId] page", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    getProgram.mockReset().mockResolvedValue(program);
    listAllUniversities.mockReset().mockResolvedValue([]);
    getProfile.mockReset().mockResolvedValue(null);
    listDocumentsForUser.mockReset().mockResolvedValue([]);
    listAllPlanForUser.mockReset().mockResolvedValue([]);
  });

  it("fetches the plan and passes derived per-key state to the view", async () => {
    listAllPlanForUser.mockResolvedValue([
      planRow("apply-for-noc", "todo"),
      planRow("prepare-biometrics", "todo", "2026-06-09T00:00:00Z"),
      planRow("prepare-police-certificate", "done"),
      planRow("translate-certify-documents", "dismissed"),
    ]);
    const ui = await ProgramChecklistPage({ params: Promise.resolve({ programId: "p1" }) });
    render(ui);
    expect(listAllPlanForUser).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(screen.getByTestId("view")).toHaveTextContent(
      JSON.stringify({
        "noc-application": "open",
        biometrics: "in-progress",
        "police-certificate": "done",
      }),
    );
  });

  it("passes an empty state map when the user has no plan rows", async () => {
    const ui = await ProgramChecklistPage({ params: Promise.resolve({ programId: "p1" }) });
    render(ui);
    expect(screen.getByTestId("view")).toHaveTextContent("{}");
  });
});
