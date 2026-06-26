import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AppError from "@/app/(app)/error";
import AppLoading from "@/app/(app)/loading";
import GlobalError from "@/app/global-error";

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
