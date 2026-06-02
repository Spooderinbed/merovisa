import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptionCard } from "@/components/ui/option-card";

describe("OptionCard", () => {
  it("renders label + description and fires onSelect", async () => {
    const onSelect = vi.fn();
    render(<OptionCard label="Nepal" description="Default" selected={false} onSelect={onSelect} />);
    expect(screen.getByText("Default")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Nepal/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("reflects selected state via aria-checked", () => {
    render(<OptionCard label="India" selected onSelect={() => {}} />);
    expect(screen.getByRole("radio", { name: "India" })).toHaveAttribute("aria-checked", "true");
  });

  it("uses checkbox role when multi", () => {
    render(<OptionCard label="Worked" selected onSelect={() => {}} multi />);
    expect(screen.getByRole("checkbox", { name: "Worked" })).toBeInTheDocument();
  });
});
