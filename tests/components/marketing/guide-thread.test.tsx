// tests/components/marketing/guide-thread.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GuideThread } from "@/components/marketing/guide-thread";

describe("GuideThread", () => {
  afterEach(() => vi.restoreAllMocks());

  it("SSR rest: the ielts exchange is fully rendered with its bare citation; thread is aria-live=off", () => {
    const html = renderToStaticMarkup(<GuideThread />);
    expect(html).toContain("I got 6.5 overall. Is that actually enough?");
    expect(html).toContain("already meets the bar");
    expect(html).toContain("Home Affairs · Jun 2026");
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
});
