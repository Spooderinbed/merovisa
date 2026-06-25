import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

import { AuthCard } from "@/components/auth/auth-card";

describe("AuthCard", () => {
  beforeEach(() => signInWithOAuth.mockReset());

  it("starts collapsed and renders the Google CTA + privacy line", () => {
    render(<AuthCard />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByText(/Your profile is private/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
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

  it("discloses honestly that email sign-in isn't ready — no fake submit masquerading as login", async () => {
    render(<AuthCard />);
    await userEvent.click(screen.getByRole("button", { name: /Other ways to sign in/i }));
    expect(await screen.findByText(/Email sign-in isn't ready yet/i)).toBeInTheDocument();
    // no email input and no submit button pretending to create an account
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Create account/i })).toBeNull();
  });
});
