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

  it("renders an optional trailing adornment in the trigger, beside the chevron", () => {
    render(
      <Disclosure title="Section" trailing={<span>Complete</span>}>
        <p>Body</p>
      </Disclosure>,
    );
    // The adornment lives inside the trigger so it is visible while collapsed,
    // and it is part of the button — never a focus-stealing nested control.
    const trigger = screen.getByRole("button", { name: /Section/ });
    const badge = screen.getByText("Complete");
    expect(badge).toBeInTheDocument();
    expect(trigger).toContainElement(badge);
  });

  it("insets the trigger focus ring so keyboard focus stays visible inside the overflow-hidden card (WCAG 2.4.7)", () => {
    // The global focus ring is outline-offset:2px — painted OUTSIDE the element
    // box. The Disclosure Card is overflow-hidden (load-bearing: it clips the
    // header's hover-bg to the card's rounded corners), and the trigger button's
    // box is flush with that clip box, so the outside ring gets clipped away —
    // every profile section header showed NO visible keyboard focus outline. The
    // trigger insets its own ring (negative outline-offset) so it paints inside
    // the clip. jsdom has no layout engine, so guard the class contract, not px.
    render(
      <Disclosure title="Know before you go">
        <p>Body</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: /Know before you go/ });
    expect(trigger.className).toContain("focus-visible:[outline-offset:-2px]");
  });
});
