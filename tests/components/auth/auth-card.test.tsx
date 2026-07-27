import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { AuthCard } from "@/components/auth/auth-card";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("AuthCard", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  it("offers both sign-in methods on one screen: Google and email", () => {
    render(<AuthCard />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByText(/Your profile is private/i)).toBeInTheDocument();
  });

  it("starts Google OAuth pointing at /auth/callback (no claim id on the standalone /auth)", async () => {
    render(<AuthCard />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback?next=%2Fdashboard"),
        }),
      }),
    );
    const arg = signInWithOAuth.mock.calls[0]![0];
    expect(arg.options.redirectTo).not.toMatch(/claim=/);
  });

  // MV-147 — the dead affordance is gone. This used to read "Email sign-in isn't
  // ready yet", which was honest but was still a wall for anyone without Google.
  it("no longer tells the student that email sign-in is unavailable", () => {
    render(<AuthCard />);
    expect(screen.queryByText(/isn't ready yet/i)).toBeNull();
    expect(screen.getByRole("button", { name: /send.*code/i })).toBeInTheDocument();
  });

  // The anonymous-recovery contract: whichever method the student picks, the same
  // signed claim token has to travel with it, or email sign-in silently loses the
  // assessment that Google sign-in would have kept.
  it("carries the claim token into both the Google redirect and the email request", async () => {
    render(<AuthCard claimToken="tok.123.sig" />);

    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    expect(signInWithOAuth.mock.calls[0]![0].options.redirectTo).toContain("claim=tok.123.sig");

    await userEvent.type(screen.getByLabelText(/email address/i), "aarav@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send.*code/i }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toMatchObject({
      claim: "tok.123.sig",
    });
  });

  // Wave A / A4 (MV-109) — two-beat entrance, reduced-motion-safe. Both `rise`
  // and `settle` are keyframe-baked (no raw animation-delay), so the shared
  // reduced-motion guard collapses them to the final state without a flash.
  it("gives the header a rise entrance and the sign-in card a settle entrance", () => {
    render(<AuthCard />);
    const heading = screen.getByRole("heading", { name: /Save your result/i });
    expect(heading.parentElement).toHaveClass("animate-rise");
    const cta = screen.getByRole("button", { name: /Continue with Google/i });
    expect(cta.closest(".animate-settle")).not.toBeNull();
  });
});
