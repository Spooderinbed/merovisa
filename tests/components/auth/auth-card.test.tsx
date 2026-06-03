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

  it("reveals an email field behind the disclosure and shows a coming-soon notice on submit", async () => {
    render(<AuthCard />);
    await userEvent.click(screen.getByRole("button", { name: /Other ways to sign in/i }));
    const email = screen.getByLabelText(/email/i);
    await userEvent.type(email, "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Create account & save/i }));
    expect(await screen.findByText(/Email sign-in is coming soon/i)).toBeInTheDocument();
  });
});
