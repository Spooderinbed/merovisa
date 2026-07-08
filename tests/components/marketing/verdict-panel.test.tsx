import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { VerdictPanel } from "@/components/marketing/verdict-panel";

function reduceMotion() {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
}

describe("VerdictPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("SSR rest state (no effects): Possible, four dims, final cost, Sample label, no 'verified'", () => {
    const html = renderToStaticMarkup(<VerdictPanel />);
    expect(html).toContain("Possible");
    for (const d of ["Academic", "English", "Finances", "Visa risk"]) expect(html).toContain(d);
    expect(html).toContain("≈ A$42,600");
    expect(html).toContain("Sample profile");
    expect(html).not.toMatch(/verified/i); // cost is a sample estimate, never a sourced claim
    expect(html).toMatch(/width:82%/);     // fill set inline, not 0
  });

  it("each fill bar is a DIRECT child of .dim (sibling of .dim-head, outside the collapsible detail) so it shows at rest", () => {
    // jsdom does not apply the native <details> content-hiding UA rule, so we cannot
    // assert visibility directly. Instead assert the STRUCTURE that guarantees it:
    // the .bar must be a direct child of .dim and never nested inside .dim-detail /
    // .dim-head, and there must be no <details>/<summary> that could UA-hide it.
    const { container } = render(<VerdictPanel />);
    const dims = container.querySelectorAll(".dim");
    expect(dims).toHaveLength(4);
    for (const dim of Array.from(dims)) {
      expect(dim.querySelector(":scope > .bar")).not.toBeNull();   // bar is a DIRECT child of .dim
      expect(dim.querySelector(":scope > .bar > .fill")).not.toBeNull();
      expect(dim.querySelector(".dim-detail .bar")).toBeNull();    // never inside the collapsible region
      expect(dim.querySelector(".dim-head .bar")).toBeNull();      // never inside the toggle button
      expect(dim.querySelector("details, summary")).toBeNull();    // no native <details> to UA-hide it
    }
  });

  it("dimension rows expand via the .open class (aria-expanded flips), not native <details>", () => {
    render(<VerdictPanel />);
    const head = screen.getByRole("button", { name: /Academic/i });
    expect(head).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    expect(head.closest(".dim")).toHaveClass("open");
  });

  it("the 'See full breakdown' affordance is a real link to /assess", () => {
    render(<VerdictPanel />);
    expect(screen.getByRole("link", { name: /See full breakdown/i })).toHaveAttribute("href", "/assess");
  });

  it("clicking a profile flips the toggle pill instantly, before the content crossfades (no 150ms lag)", () => {
    // Regression guard for the shipped lag: selecting a profile used to delay
    // `activeId`, which drove BOTH the pill highlight and the content, so the pill
    // sat unresponsive for 150ms. The pill must react on the tick of the click;
    // only the panel content waits for the crossfade.
    vi.useFakeTimers();
    try {
      render(<VerdictPanel />);
      const shruti = screen.getByRole("radio", { name: /Shruti · GPA 3.8/i });
      const aarav = screen.getByRole("radio", { name: /Aarav · GPA 3.2/i });
      fireEvent.click(shruti);
      // Pill reacts immediately — no timer advanced yet.
      expect(shruti).toBeChecked();
      expect(aarav).not.toBeChecked();
      expect(shruti.closest(".toggle-opt")).toHaveClass("on");
      expect(aarav.closest(".toggle-opt")).not.toHaveClass("on");
      // …while the panel content is still showing the previous verdict mid-crossfade.
      expect(within(screen.getByRole("status")).getByText("Possible")).toBeInTheDocument();
      // After the crossfade window, the content catches up to the selected profile.
      act(() => { vi.advanceTimersByTime(160); });
      expect(within(screen.getByRole("status")).getByText("Strong")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes a native radio group; toggling to Shruti yields Strong (reduced motion)", () => {
    reduceMotion();
    render(<VerdictPanel />);
    const shruti = screen.getByRole("radio", { name: /Shruti · GPA 3.8/i });
    fireEvent.click(shruti);
    const verdict = screen.getByRole("status");
    expect(within(verdict).getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("≈ A$44,200")).toBeInTheDocument();
  });
});
