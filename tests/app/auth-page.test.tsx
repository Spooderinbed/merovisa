import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
  AuthCard: () => <div>auth-card</div>,
}));

import AuthPage from "@/app/(marketing)/auth/page";

describe("/auth page", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("renders the AuthCard when no user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const ui = await AuthPage();
    render(ui);
    expect(screen.getByText("auth-card")).toBeInTheDocument();
  });

  it("redirects to / when the user is already signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    await expect(AuthPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
