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
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (_key: string) => null }),
}));
vi.mock("@/components/layout/app-bar", () => ({
  AppBar: () => <div data-testid="appbar">appbar</div>,
}));
vi.mock("@/components/layout/footer", () => ({
  Footer: () => <div data-testid="footer">footer</div>,
}));
vi.mock("@/components/layout/mobile-tab-bar", () => ({
  MobileTabBar: () => <div data-testid="mobile-tab-bar">tabs</div>,
}));

import AppLayout from "@/app/(app)/layout";

describe("(app) layout", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
  });

  it("redirects to /auth?next=%2Fdashboard when no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AppLayout({ children: <div>kid</div> })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth?next=%2Fdashboard");
  });

  it("renders chrome around children when user is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    render(ui);
    expect(screen.getByTestId("appbar")).toBeInTheDocument();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-tab-bar")).toBeInTheDocument();
  });

  it("activates the np-au corridor on the signed-in shell (MVP: every user is Nepal → Australia)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    const { container } = render(ui);
    const scope = container.querySelector('[data-corridor="np-au"]');
    expect(scope).not.toBeNull();
    // Chrome and content both live inside the corridor scope, so Phase-2
    // surfaces can consume corridor accents without re-wiring the shell.
    expect(scope!.querySelector('[data-testid="appbar"]')).not.toBeNull();
    expect(scope!.querySelector("main")).not.toBeNull();
    // Token carrier only — must not generate a layout box.
    expect((scope as HTMLElement).className).toContain("contents");
  });

  it("pads the content area below md so the tab bar never covers it", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    const { container } = render(ui);
    const wrapper = container.querySelector("main")!.parentElement!;
    expect(wrapper.className).toContain("pb-[calc(56px+env(safe-area-inset-bottom))]");
    expect(wrapper.className).toContain("md:pb-0");
  });
});
