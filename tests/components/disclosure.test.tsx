import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Disclosure } from "@/components/ui/disclosure";

describe("Disclosure", () => {
  it("renders the title and hides the body when collapsed by default", () => {
    render(
      <Disclosure title="Know before you go">
        <p>Hidden reference content</p>
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: /Know before you go/ })).toBeInTheDocument();
    expect(screen.queryByText("Hidden reference content")).toBeNull();
  });

  it("renders the body when defaultOpen is set", () => {
    render(
      <Disclosure title="Know before you go" defaultOpen>
        <p>Visible reference content</p>
      </Disclosure>,
    );
    expect(screen.getByText("Visible reference content")).toBeInTheDocument();
  });

  it("toggles the body on click and tracks aria-expanded", () => {
    render(
      <Disclosure title="Know before you go">
        <p>Toggled content</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: /Know before you go/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Toggled content")).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Toggled content")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Toggled content")).toBeNull();
  });

  it("wires the trigger to the panel via aria-controls / id for screen readers", () => {
    render(
      <Disclosure title="Know before you go" defaultOpen>
        <p>Panel content</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: /Know before you go/ });
    const controls = trigger.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).not.toBeNull();
  });

  it("renders an optional subtitle alongside the title", () => {
    render(
      <Disclosure title="Know before you go" subtitle="Government reference">
        <p>Body</p>
      </Disclosure>,
    );
    expect(screen.getByText("Government reference")).toBeInTheDocument();
  });
});
