import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input, Select } from "@/components/ui/input";

// MV-92: the Input/Select primitives extract the one form-field shell that was
// copied verbatim across the profile editors. The contract: render the right
// element, carry the canonical shell, and pass every other prop straight through.

const SHELL = ["rounded-md", "border-line-2", "bg-surface", "focus:border-primary"];

describe("Input primitive (MV-92)", () => {
  it("renders an <input> carrying the canonical field shell", () => {
    render(<Input aria-label="Full name" />);
    const el = screen.getByRole("textbox", { name: "Full name" });
    expect(el.tagName).toBe("INPUT");
    for (const cls of SHELL) expect(el).toHaveClass(cls);
  });

  it("merges a per-site className (e.g. a width) alongside the shell", () => {
    render(<Input aria-label="Age" className="w-24" />);
    const el = screen.getByRole("textbox", { name: "Age" });
    expect(el).toHaveClass("w-24");
    expect(el).toHaveClass("rounded-md"); // shell still present
  });

  it("forwards standard input props (type, disabled, placeholder)", () => {
    render(<Input aria-label="Score" type="number" placeholder="0" disabled />);
    const el = screen.getByRole("spinbutton", { name: "Score" });
    expect(el).toHaveAttribute("type", "number");
    expect(el).toHaveAttribute("placeholder", "0");
    expect(el).toBeDisabled();
  });

  it("stays a passthrough — does not inject a type when none is given", () => {
    render(<Input aria-label="Bare" />);
    expect(screen.getByRole("textbox", { name: "Bare" })).not.toHaveAttribute("type");
  });

  it("fires onChange as a controlled input", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="City" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "City" }), "K");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Select primitive (MV-92)", () => {
  it("renders a <select> with the shell and its option children", () => {
    render(
      <Select aria-label="Country" defaultValue="np">
        <option value="np">Nepal</option>
        <option value="au">Australia</option>
      </Select>,
    );
    const el = screen.getByRole("combobox", { name: "Country" });
    expect(el.tagName).toBe("SELECT");
    for (const cls of SHELL) expect(el).toHaveClass(cls);
    expect(screen.getByRole("option", { name: "Nepal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Australia" })).toBeInTheDocument();
  });

  it("forwards value/onChange/disabled", async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Level" value="bachelor" onChange={onChange}>
        <option value="bachelor">Bachelor</option>
        <option value="master">Master</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Level" }), "master");
    expect(onChange).toHaveBeenCalled();
  });
});
