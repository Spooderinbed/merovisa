import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth/auth-card", () => ({
  AuthCard: ({ claimToken }: { claimToken?: string | null }) => (
    <div>auth-card{claimToken ? `:${claimToken}` : ""}</div>
  ),
}));

import { verifyClaim } from "@/lib/auth/hmac-claim";
import AuthPage from "@/app/(marketing)/auth/page";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

describe("/auth page", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("renders the AuthCard when no user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByText("auth-card")).toBeInTheDocument();
  });

  it("redirects to /dashboard when the user is already signed in and no next param", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(AuthPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to ?next= when present and relative", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(AuthPage({ searchParams: Promise.resolve({ next: "/profile" }) })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/profile");
  });

  it("rejects a protocol-relative ?next= and falls back to /dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(AuthPage({ searchParams: Promise.resolve({ next: "//attacker.com" }) })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  // MV-147 — an anonymous visitor who picks email over Google arrives here by link,
  // so the page (not a browser fetch) signs the claim their assessment needs. Without
  // it, choosing email would quietly cost them the assessment Google would have kept.
  it("signs a claim token for the assessment the visitor arrived with", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage({ searchParams: Promise.resolve({ assessment: ASSESSMENT_UUID }) });
    render(ui);

    const rendered = screen.getByText(/^auth-card:/).textContent!;
    const token = rendered.replace("auth-card:", "");
    expect(verifyClaim(token)).toEqual({ assessmentId: ASSESSMENT_UUID });
  });

  it("ignores an ?assessment= that isn't an assessment id", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage({ searchParams: Promise.resolve({ assessment: "../../etc/passwd" }) });
    render(ui);
    expect(screen.getByText("auth-card")).toBeInTheDocument();
  });
});
