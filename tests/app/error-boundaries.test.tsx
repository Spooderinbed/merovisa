import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import AppError from "@/app/(app)/error";
import AppLoading from "@/app/(app)/loading";
import GlobalError from "@/app/global-error";
import FocusedError from "@/app/(focused)/error";
import FocusedLoading from "@/app/(focused)/loading";
import MarketingError from "@/app/(marketing)/error";
import MarketingLoading from "@/app/(marketing)/loading";

beforeEach(() => {
  refresh.mockClear();
});

describe("signed-in route error boundary", () => {
  it("shows a calm, reassuring message and a working retry", async () => {
    const reset = vi.fn();
    render(<AppError error={new Error("supabase down")} reset={reset} />);
    expect(screen.getByText(/couldn.t load this page/i)).toBeInTheDocument();
    // Reassures rather than alarms — saved data is safe, it's likely transient.
    expect(screen.getByText(/your saved data is safe/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // This boundary guards SERVER components (the dashboard's six-way Promise.all, the
  // matches page's four-way one). `reset()` alone re-renders them from the cached
  // payload that already failed, so the button would do nothing for exactly the
  // flaky-connection case the copy promises to recover from (MV-184).
  it("re-runs the failed server read, not just the boundary", async () => {
    render(<AppError error={new Error("supabase down")} reset={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("signed-in route loading skeleton", () => {
  it("announces a busy state to assistive tech", () => {
    const { container } = render(<AppLoading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("global (root) error boundary", () => {
  it("renders a self-contained retry that calls reset", async () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("root layout blew up")} reset={reset} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // global-error fires when a layout itself throws, past every per-segment error.tsx —
  // the one boundary an anonymous visitor can reach. An anon assessment that hit a
  // persist-miss (id:null) has nothing saved, so promising "your saved data is safe"
  // here is a false reassurance on a trust-first product. Copy must state only what's
  // always true (MV-67).
  it("does not promise saved data is safe — the one boundary anonymous users reach", () => {
    render(<GlobalError error={new Error("root layout blew up")} reset={vi.fn()} />);
    expect(screen.queryByText(/saved data/i)).toBeNull();
    expect(screen.getByText(/usually temporary/i)).toBeInTheDocument();
  });
});

// The (focused) group hosts the anonymous results (assess) and the recovered/saved
// assessment view (assessment/[id]) — both doing live Supabase reads. Without these
// boundaries a thrown read bubbled to global-error (document-replacing, no FocusBar)
// and a slow read showed a blank frame. This is the conversion-critical surface, so
// a failed/slow load must recover calmly in place, not dead-end the student.
describe("focused (results) route error boundary", () => {
  it("names the results context and offers a working retry", async () => {
    const reset = vi.fn();
    render(<FocusedError error={new Error("assessment read failed")} reset={reset} />);
    expect(screen.getByText(/couldn.t load your results/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("focused (results) route loading skeleton", () => {
  it("announces a busy state to assistive tech", () => {
    const { container } = render(<FocusedLoading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

// The (marketing) group is the first-impression surface — landing, how, trust,
// destinations, auth — and its page.tsx / auth/page.tsx do live supabase reads. A
// page-level throw previously bubbled to the document-replacing global-error. This
// boundary catches it inside the marketing chrome with a calm retry. Copy stays
// honest: an anonymous visitor has nothing saved, so it must NOT claim saved data.
describe("marketing route error boundary", () => {
  it("offers a calm retry without over-claiming saved data (anonymous surface)", async () => {
    const reset = vi.fn();
    render(<MarketingError error={new Error("marketing read failed")} reset={reset} />);
    expect(screen.getByText(/couldn.t load this page/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved data/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("marketing route loading skeleton", () => {
  it("announces a busy state to assistive tech", () => {
    const { container } = render(<MarketingLoading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
