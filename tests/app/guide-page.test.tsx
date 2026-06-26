import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { getUser, getPrimaryAssessmentForUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPrimaryAssessmentForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForUser }));
vi.mock("@/components/guide/guide-chat", () => ({ GuideChat: () => <div data-testid="guide-chat" /> }));

import GuidePage from "@/app/(app)/guide/page";

describe("/guide page", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getPrimaryAssessmentForUser.mockReset();
  });

  it("replaces the coming-soon stub with the live chat for a signed-in user", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue({ result: { result: { verdict: "strong" } } });
    render(await GuidePage());
    expect(screen.getByTestId("guide-chat")).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("nudges the student to run an assessment when they have none yet, but still offers the chat", async () => {
    getPrimaryAssessmentForUser.mockResolvedValue(null);
    render(await GuidePage());
    expect(screen.getByText(/run your assessment/i)).toBeInTheDocument();
    expect(screen.getByTestId("guide-chat")).toBeInTheDocument();
  });
});
