import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import HomePage from "@/app/(marketing)/page";

describe("Marketing homepage (v7)", () => {
  it("renders the hero H1, sub-line, provenance line, and the three proof claims", async () => {
    render(await HomePage());
    expect(screen.getByText(/An honest answer before you/i)).toBeInTheDocument();
    expect(screen.getByText(/pay anyone\./i)).toBeInTheDocument();
    expect(screen.getByText(/Where do you actually stand academically/i)).toBeInTheDocument();
    expect(screen.getByText(/Built on official Home Affairs and university data/i)).toBeInTheDocument();
    expect(screen.getByText(/Official Home Affairs & university data/i)).toBeInTheDocument();
    expect(screen.getByText(/Every figure sourced and dated/i)).toBeInTheDocument();
    expect(screen.getByText(/Free, no sign-up to start/i)).toBeInTheDocument();
  });

  it("renders each product section heading and the freshness/close copy", async () => {
    render(await HomePage());
    expect(screen.getByText(/The answer becomes a plan\./i)).toBeInTheDocument();
    expect(screen.getByText(/Every requirement, sourced\./i)).toBeInTheDocument();
    expect(screen.getByText(/A guide that remembers you\./i)).toBeInTheDocument();
    expect(screen.getAllByText(/Every figure shows its source and date\./i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Know, instead of hoping\./i)).toBeInTheDocument();
  });

  it("exposes #how and #what in-page anchor targets", async () => {
    const { container } = render(await HomePage());
    expect(container.querySelector("#how")).not.toBeNull();
    expect(container.querySelector("#what")).not.toBeNull();
  });

  it("has no dead links: no href='#'; both eligibility CTAs + See full breakdown -> /assess", async () => {
    render(await HomePage());
    const links = screen.getAllByRole("link");
    for (const a of links) expect(a.getAttribute("href")).not.toBe("#");
    const assess = links.filter((a) => a.getAttribute("href") === "/assess");
    // hero CTA + 3 section soft links + verdict "See full breakdown" + closing sparkle CTA
    expect(assess.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole("link", { name: /See full breakdown/i })).toHaveAttribute("href", "/assess");
    const eligibilityCtas = screen.getAllByRole("link", { name: /Check your eligibility/i });
    expect(eligibilityCtas.length).toBeGreaterThanOrEqual(2);
    for (const cta of eligibilityCtas) expect(cta.getAttribute("href")).toBe("/assess");
  });

  it("does not render the removed TrustStrip / tiles copy", async () => {
    render(await HomePage());
    expect(screen.queryByText(/Three quiet tools, no clutter/i)).toBeNull();
    expect(screen.queryByText(/A preview of your feed/i)).toBeNull();
  });

  it("redirects signed-in users to /dashboard before rendering", async () => {
    vi.resetModules();
    const redirectSpy = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
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
