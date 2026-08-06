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
    expect(screen.getByText(/^pay anyone$/i)).toBeInTheDocument();
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

  // MV-162 item 3 — declutter the hero. The reviewer counted six competing
  // elements above the fold and asked for weight on "pay anyone" alone instead
  // of a highlight band across the whole second line.
  it("emphasises the two words 'pay anyone' alone, with no highlight band", async () => {
    const { container } = render(await HomePage());
    const h1 = container.querySelector("h1")!;
    expect(h1.textContent).toBe("An honest answer before you pay anyone.");
    // the band (.accent.hand, the hand-drawn marker) is gone
    expect(h1.querySelector(".accent")).toBeNull();
    // weight carries the emphasis, and only over the two words
    const emphasis = Array.from(h1.querySelectorAll("strong"));
    expect(emphasis.map((n) => n.textContent)).toEqual(["pay anyone"]);
  });

  it("keeps at most four elements in the hero: headline, sub, sourcing line, CTA", async () => {
    const { container } = render(await HomePage());
    const heroTop = container.querySelector(".hero-top")!;
    expect(heroTop.children).toHaveLength(4);
    expect(heroTop.querySelector("h1")).not.toBeNull();
    expect(heroTop.querySelector(".sub")).not.toBeNull();
    expect(heroTop.querySelector(".prov")).not.toBeNull();
    expect(heroTop.querySelector("a.cta")).toHaveAttribute("href", "/assess");
  });

  it("drops the hero eyebrow and the CTA caption (the two weakest earners)", async () => {
    const { container } = render(await HomePage());
    const heroTop = container.querySelector(".hero-top")!;
    expect(screen.queryByText(/For students applying abroad/i)).toBeNull();
    expect(heroTop.querySelector(".eyebrow")).toBeNull();
    expect(heroTop.querySelector(".meta")).toBeNull();
    expect(heroTop.textContent).not.toMatch(/9 quick questions/i);
  });

  it("keeps the sourcing claim in the hero and echoes it in the proof strip", async () => {
    const { container } = render(await HomePage());
    const hero = container.querySelector("section.hero")!;
    expect(hero.querySelector(".prov")!.textContent).toMatch(
      /Built on official Home Affairs and university data\. Every figure shows its source and date\./i,
    );
    const proof = Array.from(hero.querySelectorAll(".pf")).map((n) => n.textContent);
    expect(proof).toContain("Official Home Affairs & university data");
    expect(proof).toContain("Every figure sourced and dated");
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
