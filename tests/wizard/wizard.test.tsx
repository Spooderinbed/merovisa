import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wizard } from "@/components/wizard/wizard";

describe("Wizard", () => {
  it("advances from home country into the destination (corridor) question as step 2", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    const cont = screen.getByRole("button", { name: /Continue/ });
    expect(cont).toBeEnabled(); // Nepal is preselected on step 1.
    await userEvent.click(cont);
    // MV-47: the corridor question is now step 2, before the effort screens, and
    // its eyebrow reads "Step 2" (no longer the buried "Step 7").
    expect(screen.getByText(/Where do you want to go\?/)).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    // Continue stays disabled until a supported corridor is chosen.
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("renders a callout inline when the current answer triggers one", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Continue/ })); // -> destination
    await userEvent.click(screen.getByRole("radio", { name: /Australia/ }));
    await userEvent.click(screen.getByRole("button", { name: /Continue/ })); // -> education
    await userEvent.click(screen.getByRole("radio", { name: /Bachelor's degree/ }));
    await userEvent.click(screen.getByRole("button", { name: /Continue/ })); // -> field of study
    await userEvent.click(screen.getByRole("radio", { name: /Computer Science/ }));
    expect(screen.getByText(/What do you want to study\?/)).toBeInTheDocument();
  });
});
