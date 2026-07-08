import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VerdictPanel } from "@/components/marketing/verdict-panel";
import { GuideThread } from "@/components/marketing/guide-thread";
import { FreshnessTable } from "@/components/marketing/freshness-table";
import { DocumentsChecklist } from "@/components/marketing/documents-checklist";

afterEach(() => vi.restoreAllMocks());

describe("landing hydration parity", () => {
  it("no Math.random / matchMedia / IntersectionObserver during initial render", () => {
    const rnd = vi.spyOn(Math, "random");
    const mm = vi.spyOn(window, "matchMedia");
    const io = vi.spyOn(window, "IntersectionObserver");
    renderToString(<VerdictPanel />);
    renderToString(<GuideThread />);
    renderToString(<FreshnessTable />);
    renderToString(<DocumentsChecklist />);
    expect(rnd).not.toHaveBeenCalled();
    expect(mm).not.toHaveBeenCalled();
    expect(io).not.toHaveBeenCalled();
  });

  it("SSR-then-hydrate each island produces no React hydration mismatch warning (invariant 2)", () => {
    // A REAL hydration test: render the island's server HTML, mount it into a
    // container, then hydrateRoot the SAME component onto that markup. React only
    // emits "did not match" / "server HTML" warnings when the first client paint
    // diverges from the SSR output, which is exactly invariant 2. (A plain client
    // render() never hydrates server HTML, so it can never surface this class of
    // bug; the forbidden-calls test above is the other half of the invariant-2
    // guard.)
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const islands = [
      <VerdictPanel key="verdict" />,
      <GuideThread key="guide" />,
      <FreshnessTable key="freshness" />,
      <DocumentsChecklist key="documents" />,
    ];
    for (const island of islands) {
      const html = renderToString(island);
      const container = document.createElement("div");
      container.innerHTML = html;
      let root!: ReturnType<typeof hydrateRoot>;
      act(() => {
        root = hydrateRoot(container, island);
      });
      act(() => {
        root.unmount();
      });
    }
    const hydrationWarnings = err.mock.calls.filter((c) =>
      String(c[0]).match(/hydrat|did not match|server HTML/i),
    );
    expect(hydrationWarnings).toEqual([]);
  });
});

describe("landing reduced-motion behaviour", () => {
  it("keeps interaction (toggle/checkbox/chip) working while animation is suppressed", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    // verdict toggle still switches to Strong, instantly
    const { unmount } = render(<VerdictPanel />);
    fireEvent.click(screen.getByRole("radio", { name: /Shruti/i }));
    // The verdict word lives in the role="status" region; dimension tone tags
    // reuse the same words, so scope the check to the verdict rather than a bare
    // getByText (which would match multiple nodes).
    expect(screen.getByRole("status")).toHaveTextContent("Strong");
    unmount();
    // checklist still toggles
    const view = render(<DocumentsChecklist />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmation of Enrolment/i }));
    // The count renders as `<b>3</b> of 6 ready` (split across nodes), so assert on
    // the container's normalized text rather than a single contiguous text node.
    expect(view.container).toHaveTextContent(/3 of 6 ready/);
  });
});
