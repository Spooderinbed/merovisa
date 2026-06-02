import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Slider } from "@/components/ui/slider";

describe("Slider", () => {
  it("renders a range input and emits numeric changes", () => {
    const onChange = vi.fn();
    render(<Slider ariaLabel="Grade" min={40} max={100} step={1} value={70} onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Grade" });
    fireEvent.change(input, { target: { value: "85" } });
    expect(onChange).toHaveBeenCalledWith(85);
  });
});
