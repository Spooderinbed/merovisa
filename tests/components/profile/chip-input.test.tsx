import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipInput } from "@/components/profile/editors/chip-input";

/** Stateful harness so add/remove round-trip through a real string[] value. */
function Harness({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <label htmlFor="ci-test" className="sr-only">Tags</label>
      <ChipInput id="ci-test" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe("ChipInput", () => {
  it("renders existing values as removable chips", () => {
    render(<Harness initial={["merit", "regional"]} />);
    expect(screen.getByRole("button", { name: /Remove merit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove regional/i })).toBeInTheDocument();
  });

  it("adds a chip on Enter and clears the text input", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    await userEvent.type(input, "pay slip{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(["pay slip"]));
    expect(input).toHaveValue("");
  });

  it("adds a chip on comma without writing the comma", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    await userEvent.type(input, "merit,");
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(["merit"]));
    expect(input).toHaveValue("");
  });

  it("removes a chip when it is clicked", async () => {
    render(<Harness initial={["merit", "regional"]} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove merit/i }));
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(["regional"]));
  });

  it("ignores empty and duplicate entries", async () => {
    render(<Harness initial={["merit"]} />);
    const input = screen.getByLabelText("Tags");
    await userEvent.type(input, "   {Enter}");
    await userEvent.type(input, "merit{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(["merit"]));
  });

  it("commits a typed draft on blur so it is not lost before a save", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Tags");
    await userEvent.type(input, "letter");
    await userEvent.tab();
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify(["letter"]));
  });

  it("does not submit a surrounding form when Enter adds a chip", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    function FormHarness() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <form onSubmit={onSubmit}>
          <label htmlFor="ci-form" className="sr-only">Tags</label>
          <ChipInput id="ci-form" value={value} onChange={setValue} />
        </form>
      );
    }
    render(<FormHarness />);
    await userEvent.type(screen.getByLabelText("Tags"), "merit{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
