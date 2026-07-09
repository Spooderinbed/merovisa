// tests/components/marketing/freshness-table.test.tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, act } from "@testing-library/react";
import { FreshnessTable } from "@/components/marketing/freshness-table";
import { FRESHNESS_ROWS } from "@/lib/marketing/freshness-rows";

describe("FreshnessTable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("SSR (no effects): all five rows expose value, source, verified, and next-check at rest", () => {
    const html = renderToStaticMarkup(<FreshnessTable />);
    // value + provenance visible without interaction
    expect(html).toContain("A$29,710");
    expect(html).toContain("s.500 criteria");
    expect(html).toContain("≈ A$33,000");
    expect(html).toContain("2–4 years");
    expect(html).toContain("required");
    expect((html.match(/verified Jun 2026/g) ?? []).length).toBe(5);
    expect((html.match(/next check Jul 2026/g) ?? []).length).toBe(5);
    // The verify pulse is staged for the on-scroll sweep, not fired at mount — so no
    // row carries the `verified` class at rest (it would burn the pulse off-screen).
    expect((html.match(/frow verified/g) ?? []).length).toBe(0);
    expect((html.match(/class="frow"/g) ?? []).length).toBe(5);
  });

  it("stages the verified pulse per row as the sweep reaches it (not hardcoded at mount)", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    let cb: IntersectionObserverCallback | null = null;
    class IO {
      constructor(c: IntersectionObserverCallback) {
        cb = c;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", IO);

    const { container } = render(<FreshnessTable />);
    // Nothing verified until the table is intersected.
    expect(container.querySelectorAll(".frow.verified").length).toBe(0);

    act(() => {
      cb?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    act(() => {
      vi.advanceTimersByTime(130 * FRESHNESS_ROWS.length + 20);
    });

    // Every row is verified once the sweep has passed over it, and stays verified.
    expect(container.querySelectorAll(".frow.verified").length).toBe(FRESHNESS_ROWS.length);
  });

  it("shows the static verified dots immediately for reduced-motion users (no sweep)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { container } = render(<FreshnessTable />);
    // Reduced motion skips the sweep, so the end-state (dots present) is applied at once.
    expect(container.querySelectorAll(".frow.verified").length).toBe(FRESHNESS_ROWS.length);
  });

  it("never renders user-facing GTE", () => {
    expect(renderToStaticMarkup(<FreshnessTable />)).not.toMatch(/GTE/);
  });
});
