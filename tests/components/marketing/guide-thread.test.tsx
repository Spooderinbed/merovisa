// tests/components/marketing/guide-thread.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { GuideThread } from "@/components/marketing/guide-thread";

describe("GuideThread", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("SSR rest: the ielts exchange is fully rendered with its verified citation; thread is aria-live=off", () => {
    const html = renderToStaticMarkup(<GuideThread />);
    expect(html).toContain("I got 6.5 overall. Is that actually enough?");
    expect(html).toContain("already meets the bar");
    expect(html).toContain("Home Affairs · verified Jun 2026");
    expect(html).not.toContain("Source:");
    expect(html).toMatch(/aria-live="off"/);
  });

  it("renders three chips as radios; clicking 'funds' swaps to that answer (reduced motion)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { container } = render(<GuideThread />);
    const chips = screen.getAllByRole("radio");
    expect(chips).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: /Does the money have to be mine\?/i }));
    const thread = container.querySelector(".g-thread") as HTMLElement;
    expect(within(thread).getByText(/Does the bank balance have to be my own money\?/i)).toBeInTheDocument();
    expect(within(thread).getByText(/genuinely yours and available/i)).toBeInTheDocument();
  });

  it("interrupts the in-flight typewriter on unmount — no post-unmount timers keep firing", async () => {
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

    const { unmount } = render(<GuideThread />);
    // Start the autoplay typewriter.
    await act(async () => {
      cb?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    // Let a couple of characters type — the typewriter schedules one timer at a time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0); // a run is in flight

    unmount();
    // Flush: cleanup must bump runId so the in-flight loop bails instead of scheduling
    // the next character. Without that bump the typewriter keeps a timer pending.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
