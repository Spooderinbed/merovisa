import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import HomePage from "@/app/(marketing)/page";

describe("Marketing homepage", () => {
  it("renders the headline, all three tiles, how-it-works, hero preview and trust callout", async () => {
    const ui = await HomePage();
    render(ui);
    expect(screen.getByText(/An honest answer before/i)).toBeInTheDocument();
    expect(screen.getByText(/Three quiet tools, no clutter/i)).toBeInTheDocument();
    expect(screen.getByText(/Eligibility & checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/An AI guide that remembers you/i)).toBeInTheDocument();
    expect(screen.getByText(/SOP coach/i)).toBeInTheDocument();
    expect(screen.getByText(/Tell us about you/i)).toBeInTheDocument();
    expect(screen.getByText(/A preview of your feed/i)).toBeInTheDocument();
    expect(screen.getByText(/We sit before the consultancy/i)).toBeInTheDocument();
  });

  it("frames the flow honestly (9 questions, not a ~2 minute claim) and shows the data-authority line", async () => {
    const ui = await HomePage();
    render(ui);
    expect(screen.getByText(/9 quick questions · no account needed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Built on official Home Affairs and university data/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/two minutes/i)).toBeNull();
    expect(screen.queryByText(/About 2 minutes/i)).toBeNull();
  });

  it("renders the primary hero CTA pointing to /assess", async () => {
    const ui = await HomePage();
    render(ui);
    const ctas = screen.getAllByRole("link", { name: /Check your eligibility/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    expect(ctas[0]).toHaveAttribute("href", "/assess");
  });

  it("redirects signed-in users to /dashboard", async () => {
    vi.resetModules();
    const redirectSpy = vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    vi.doMock("next/navigation", () => ({ redirect: redirectSpy }));
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      }),
    }));
    const { default: SignedInHome } = await import("@/app/(marketing)/page");
    await expect(SignedInHome()).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirectSpy).toHaveBeenCalledWith("/dashboard");
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/lib/supabase/server");
  });
});
