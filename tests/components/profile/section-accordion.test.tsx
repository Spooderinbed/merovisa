import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionAccordion } from "@/components/profile/section-accordion";

describe("SectionAccordion", () => {
  it("renders title, summary, and a status pill", () => {
    render(
      <SectionAccordion title="Personal information" summary="23 · Nepal" status="complete">
        <div>editor</div>
      </SectionAccordion>
    );
    expect(screen.getByText("Personal information")).toBeInTheDocument();
    expect(screen.getByText("23 · Nepal")).toBeInTheDocument();
    expect(screen.getByText(/Complete/i)).toBeInTheDocument();
  });

  it("toggles open on click and shows children when open", async () => {
    render(
      <SectionAccordion title="X" summary="Y" status="partial">
        <div data-testid="editor">editor</div>
      </SectionAccordion>
    );
    expect(screen.queryByTestId("editor")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /X/i }));
    expect(screen.getByTestId("editor")).toBeInTheDocument();
  });

  // Audit #21: the profile accordion had drifted from the shared Disclosure —
  // it lacked the chevron affordance and the aria-controls panel wiring. Folding
  // it onto the primitive restores both.
  it("shows a chevron affordance so the row reads as expandable", () => {
    render(
      <SectionAccordion title="Personal information" summary="23 · Nepal" status="complete">
        <div>editor</div>
      </SectionAccordion>
    );
    expect(
      screen.getByRole("button", { name: /Personal information/i }).textContent,
    ).toContain("›");
  });

  it("wires the trigger to its panel via aria-controls for screen readers", async () => {
    render(
      <SectionAccordion title="Personal information" summary="23 · Nepal" status="complete">
        <div>editor</div>
      </SectionAccordion>
    );
    const trigger = screen.getByRole("button", { name: /Personal information/i });
    await userEvent.click(trigger); // open so the panel is in the DOM
    const controls = trigger.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).not.toBeNull();
  });

  // MV-99: the restyle rides on the shared Disclosure primitive, which carries the
  // calm-authority disclosure motion — the chevron rotates on a tokenised transform
  // transition (never a raw duration). Guarding it here keeps the accordion from
  // drifting off the primitive's motion.
  it("restyles on the disclosure primitive: chevron uses a tokenised calm transition", () => {
    const { container } = render(
      <SectionAccordion title="Personal information" summary="23 · Nepal" status="complete">
        <div>editor</div>
      </SectionAccordion>
    );
    const chevron = Array.from(container.querySelectorAll("span[aria-hidden]")).find((el) =>
      /transition-transform/.test(el.className),
    );
    expect(chevron).toBeTruthy();
    const cls = chevron?.className ?? "";
    expect(cls).toContain("duration-medium");
    expect(cls).toContain("ease-calm");
    expect(cls).not.toMatch(/duration-\d/);
    expect(cls).not.toMatch(/duration-\[/);
  });
});
