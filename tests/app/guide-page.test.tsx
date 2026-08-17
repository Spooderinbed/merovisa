import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getPrimaryAssessmentForCase } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForCase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForCase }));
vi.mock("@/components/guide/guide-chat", () => ({ GuideChat: () => <div data-testid="guide-chat" /> }));

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

import GuidePage from "@/app/(app)/(student)/guide/page";

describe("/guide page", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForCase.mockReset();
  });

  it("replaces the coming-soon stub with the live chat for a signed-in user", async () => {
    getPrimaryAssessmentForCase.mockResolvedValue({ result: { result: { verdict: "strong" } } });
    render(await GuidePage());
    expect(screen.getByTestId("guide-chat")).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("nudges the student to run an assessment when they have none yet, but still offers the chat", async () => {
    getPrimaryAssessmentForCase.mockResolvedValue(null);
    render(await GuidePage());
    expect(screen.getByText(/run your assessment/i)).toBeInTheDocument();
    expect(screen.getByTestId("guide-chat")).toBeInTheDocument();
  });
});
