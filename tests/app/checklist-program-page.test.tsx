import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PlanItemRow } from "@/lib/plan/types";

vi.mock("server-only", () => ({}));

const { getUser, getProgram, listAllUniversities, getProfileForCase, listDocumentsForCase, listAllPlanForCase, listObtainedKinds } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    getProgram: vi.fn(),
    listAllUniversities: vi.fn(),
    getProfileForCase: vi.fn(),
    listDocumentsForCase: vi.fn(),
    listAllPlanForCase: vi.fn(),
    listObtainedKinds: vi.fn(),
  }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/programs/repo", () => ({ getProgram, listAllUniversities }));
vi.mock("@/lib/profiles/repo", () => ({ getProfileForCase }));
vi.mock("@/lib/documents/repo", () => ({ listDocumentsForCase }));
vi.mock("@/lib/documents/status-repo", () => ({ listObtainedKinds }));
vi.mock("@/lib/plan/repo", () => ({ listAllPlanForCase }));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/components/checklist/checklist-view", () => ({
  ChecklistView: ({ planStates, items }: { planStates?: Record<string, string>; items?: { key: string; status: string }[] }) => (
    <div>
      <div data-testid="view">{JSON.stringify(planStates ?? null)}</div>
      <div data-testid="items">{JSON.stringify((items ?? []).map((i) => ({ key: i.key, status: i.status })))}</div>
    </div>
  ),
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

import ProgramChecklistPage from "@/app/(app)/(student)/checklist/[programId]/page";
import { notFound } from "next/navigation";
import { CatalogReadError } from "@/lib/programs/errors";

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
    getProfileForCase.mockReset().mockResolvedValue(null);
    listDocumentsForCase.mockReset().mockResolvedValue([]);
    listAllPlanForCase.mockReset().mockResolvedValue([]);
    listObtainedKinds.mockReset().mockResolvedValue(new Set());
  });

  it("folds self-reported (obtained) kinds into the generated checklist (MV-69 reconnect)", async () => {
    listObtainedKinds.mockResolvedValue(new Set(["national-id"]));
    const ui = await ProgramChecklistPage({ params: Promise.resolve({ programId: "p1" }) });
    render(ui);
    expect(listObtainedKinds).toHaveBeenCalledWith(expect.anything(), "case-1");
    const items = JSON.parse(screen.getByTestId("items").textContent || "[]") as { key: string; status: string }[];
    expect(items.find((i) => i.key === "national-id")?.status).toBe("obtained");
    expect(items.find((i) => i.key === "passport")?.status).toBe("missing"); // not obtained, not uploaded
  });

  it("fetches the plan and passes derived per-key state to the view", async () => {
    listAllPlanForCase.mockResolvedValue([
      planRow("apply-for-noc", "todo"),
      planRow("prepare-biometrics", "todo", "2026-06-09T00:00:00Z"),
      planRow("prepare-police-certificate", "done"),
      planRow("translate-certify-documents", "dismissed"),
    ]);
    const ui = await ProgramChecklistPage({ params: Promise.resolve({ programId: "p1" }) });
    render(ui);
    expect(listAllPlanForCase).toHaveBeenCalledWith(expect.anything(), "case-1");
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

  // MV-133: getProgram used to return null on a read error too, so an outage was served
  // as notFound() — "this program doesn't exist" — for a program the student shortlisted
  // minutes ago. A failed read must reach the (app) retry boundary instead.
  it("does not 404 when the program read fails — it surfaces the error", async () => {
    getProgram.mockRejectedValue(new CatalogReadError("programs"));
    await expect(
      ProgramChecklistPage({ params: Promise.resolve({ programId: "p1" }) }),
    ).rejects.toThrow(CatalogReadError);
    expect(vi.mocked(notFound)).not.toHaveBeenCalled();
  });
});
