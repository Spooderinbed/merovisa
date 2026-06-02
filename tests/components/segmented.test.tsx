import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Segmented } from "@/components/ui/segmented";

describe("Segmented", () => {
  const options = [
    { value: "not-taken", label: "Not taken" },
    { value: "taken", label: "Taken" },
  ];

  it("marks the active option and fires onChange", async () => {
    const onChange = vi.fn();
    render(<Segmented ariaLabel="English status" options={options} value="not-taken" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Not taken" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Taken" }));
    expect(onChange).toHaveBeenCalledWith("taken");
  });
});
