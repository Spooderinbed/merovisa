import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getUser, redirect, getJourneySignals } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
  getJourneySignals: vi.fn(),
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
vi.mock("@/lib/journey/signals", () => ({ getJourneySignals }));
vi.mock("@/components/journey/journey-marker", () => ({
  JourneyMarker: () => <div data-testid="journey-marker">marker</div>,
}));

import AppLayout from "@/app/(app)/layout";

const okSignals = {
  hasAssessment: true,
  profilePct: 0,
  shortlistCount: 0,
  planEngaged: false,
  documentCount: 0,
  applyAttempted: false,
  applyGranted: false,
};

describe("(app) layout", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirect.mockClear();
    getJourneySignals.mockReset();
    getJourneySignals.mockResolvedValue(okSignals);
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

  it("nests the app bar + journey marker inside the min-h-dvh column with main and footer (no chrome stacked above it)", async () => {
    // Structure contract jsdom CAN see (parent/child nesting), guarding the
    // MV-115 fix for a bug jsdom canNOT (geometry): the chrome (AppBar ~66px +
    // JourneyMarker ~37px) used to sit ABOVE the 100dvh column because its
    // wrapper is display:contents (boxless), so the document was always
    // ~103px taller than one viewport -> a dead scrollbar on every short
    // signed-in page and on the streamed loading fallback, with the footer
    // pushed below the fold. The fix moves the chrome inside the column, so it
    // shares the same full-height flex parent as main + footer.
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    const { container } = render(ui);
    const column = container.querySelector("main")!.parentElement!;
    expect(column.className).toContain("min-h-dvh");
    // The full-height column owns the footer AND the chrome now.
    expect(column.querySelector('[data-testid="footer"]')).not.toBeNull();
    expect(column.querySelector('[data-testid="appbar"]')).not.toBeNull();
    expect(column.querySelector('[data-testid="journey-marker"]')).not.toBeNull();
  });

  it("mounts the persistent journey marker in the signed-in chrome", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const ui = await AppLayout({ children: <div>kid</div> });
    render(ui);
    expect(screen.getByTestId("journey-marker")).toBeInTheDocument();
  });

  it("degrades to no marker (never breaks the page) when journey signals fail", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getJourneySignals.mockRejectedValue(new Error("db down"));
    const ui = await AppLayout({ children: <div data-testid="kid">kid</div> });
    render(ui);
    expect(screen.queryByTestId("journey-marker")).toBeNull();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
    expect(screen.getByTestId("appbar")).toBeInTheDocument();
  });
});
