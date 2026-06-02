import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wizard } from "@/components/wizard/wizard";

describe("Wizard", () => {
  it("disables Continue until the step is complete, then advances", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    const cont = screen.getByRole("button", { name: /Continue/ });
    expect(cont).toBeEnabled();
    await userEvent.click(cont);
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
    expect(screen.getByText(/Your education so far/)).toBeInTheDocument();
  });

  it("renders a callout inline when the current answer triggers one", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Continue/ })); // -> education
    await userEvent.click(screen.getByRole("radio", { name: /Bachelor's degree/ }));
    await userEvent.click(screen.getByRole("button", { name: /Continue/ })); // -> field of study
    await userEvent.click(screen.getByRole("radio", { name: /Computer Science/ }));
    expect(screen.getByText(/What do you want to study\?/)).toBeInTheDocument();
  });
});
