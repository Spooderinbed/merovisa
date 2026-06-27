import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

// Render the AppBar's resolved props so we can assert which variant the layout chose.
vi.mock("@/components/layout/app-bar", () => ({
  AppBar: ({ variant, user }: { variant: string; user: unknown }) => (
    <div data-testid="appbar" data-variant={variant} data-has-user={user ? "yes" : "no"} />
  ),
}));
vi.mock("@/components/layout/footer", () => ({ Footer: () => <div data-testid="footer" /> }));

import MarketingLayout from "@/app/(marketing)/layout";

const clientWithGetUser = (getUser: () => Promise<unknown>) => ({ auth: { getUser } });

const renderLayout = async () => {
  const ui = await MarketingLayout({ children: <div data-testid="child" /> });
  return render(ui);
};

describe("(marketing) layout — session probe resilience", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the signed-in chrome when the session probe returns a user", async () => {
    createSupabaseServerClient.mockResolvedValue(
      clientWithGetUser(vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } })),
    );
    await renderLayout();
    expect(screen.getByTestId("appbar")).toHaveAttribute("data-variant", "marketing-signed-in");
    expect(screen.getByTestId("appbar")).toHaveAttribute("data-has-user", "yes");
  });

  it("renders the signed-out chrome when there is no user", async () => {
    createSupabaseServerClient.mockResolvedValue(
      clientWithGetUser(vi.fn().mockResolvedValue({ data: { user: null } })),
    );
    await renderLayout();
    expect(screen.getByTestId("appbar")).toHaveAttribute("data-variant", "marketing");
    expect(screen.getByTestId("appbar")).toHaveAttribute("data-has-user", "no");
  });

  // The audited failure path: the layout's auth.getUser() probe throws (e.g. a flaky
  // Nepal connection). It must degrade to the signed-out marketing page — NOT throw,
  // which would bubble to global-error and replace the whole document for an anonymous
  // first-time visitor (a guaranteed bounce). The page must still render; the failure
  // is logged loudly so it stays observable.
  it("degrades to the signed-out chrome (does not throw) when the session probe fails", async () => {
    createSupabaseServerClient.mockResolvedValue(
      clientWithGetUser(vi.fn().mockRejectedValue(new Error("session probe failed"))),
    );
    await renderLayout();
    expect(screen.getByTestId("appbar")).toHaveAttribute("data-variant", "marketing");
    expect(screen.getByTestId("appbar")).toHaveAttribute("data-has-user", "no");
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
