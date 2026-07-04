import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldOfStudyStep } from "@/components/wizard/steps/field-of-study-step";

const alsoGroup = () => screen.getByRole("group", { name: /also considering/i });

describe("FieldOfStudyStep", () => {
  it("hides the also-considering picker until a primary field is chosen", () => {
    render(<FieldOfStudyStep profile={{}} setField={vi.fn()} callouts={null} eyebrow="Step 4" />);
    expect(screen.queryByRole("group", { name: /also considering/i })).toBeNull();
  });

  it("selects a primary field and resets the disjoint extras", async () => {
    const setField = vi.fn();
    render(<FieldOfStudyStep profile={{}} setField={setField} callouts={null} eyebrow="Step 4" />);
    await userEvent.click(screen.getByRole("radio", { name: "Business / Management" }));
    expect(setField).toHaveBeenCalledWith({ fieldOfStudy: "business", alsoConsidering: [] });
  });

  it("offers the OTHER fields as multi-select extras, never the primary itself", () => {
    render(
      <FieldOfStudyStep
        profile={{ fieldOfStudy: "computer-science" }}
        setField={vi.fn()}
        callouts={null}
        eyebrow="Step 4"
      />,
    );
    const group = alsoGroup();
    expect(within(group).queryByRole("checkbox", { name: "Computer Science / IT" })).toBeNull();
    expect(within(group).getByRole("checkbox", { name: "Business / Management" })).toBeInTheDocument();
  });

  it("toggles an extra field into alsoConsidering", async () => {
    const setField = vi.fn();
    render(
      <FieldOfStudyStep
        profile={{ fieldOfStudy: "computer-science", alsoConsidering: [] }}
        setField={setField}
        callouts={null}
        eyebrow="Step 4"
      />,
    );
    await userEvent.click(within(alsoGroup()).getByRole("checkbox", { name: "Business / Management" }));
    expect(setField).toHaveBeenCalledWith({ alsoConsidering: ["business"] });
  });

  it("shows the honest competitiveness note for a materially easier extra", () => {
    render(
      <FieldOfStudyStep
        profile={{ fieldOfStudy: "computer-science", alsoConsidering: ["arts"] }}
        setField={vi.fn()}
        callouts={null}
        eyebrow="Step 4"
      />,
    );
    expect(screen.getByText(/less competitive admit/i)).toBeInTheDocument();
  });

  it("disables further extras once the cap is reached, but keeps selected ones toggleable", () => {
    render(
      <FieldOfStudyStep
        profile={{ fieldOfStudy: "computer-science", alsoConsidering: ["business", "nursing"] }}
        setField={vi.fn()}
        callouts={null}
        eyebrow="Step 4"
      />,
    );
    const group = alsoGroup();
    expect(within(group).getByRole("checkbox", { name: "Law" })).toBeDisabled();
    expect(within(group).getByRole("checkbox", { name: "Business / Management" })).not.toBeDisabled();
  });
});
