import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/app-bar", () => ({
  AppBar: () => <div data-testid="appbar">appbar</div>,
}));
vi.mock("@/components/layout/footer", () => ({
  Footer: () => <div data-testid="footer">footer</div>,
}));

import AppLayout from "@/app/(app)/layout";

describe("(app) layout", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("redirects to /auth?next=/dashboard when no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AppLayout({ children: <div>kid</div> })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth?next=/dashboard");
  });

  it("renders chrome around children when user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    render(ui);
    expect(screen.getByTestId("appbar")).toBeInTheDocument();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });
});
