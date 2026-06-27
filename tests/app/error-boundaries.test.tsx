import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AppError from "@/app/(app)/error";
import AppLoading from "@/app/(app)/loading";
import GlobalError from "@/app/global-error";
import FocusedError from "@/app/(focused)/error";
import FocusedLoading from "@/app/(focused)/loading";
import MarketingError from "@/app/(marketing)/error";
import MarketingLoading from "@/app/(marketing)/loading";

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
