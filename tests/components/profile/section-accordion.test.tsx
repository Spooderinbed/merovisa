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
});
