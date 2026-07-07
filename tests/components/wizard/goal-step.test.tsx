import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalStep } from "@/components/wizard/steps/goal-step";

describe("GoalStep copy", () => {
  it("subtext is honest about partial preference coverage", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} eyebrow="Step 1" />);
    expect(
      screen.getByText(
        "We use this to order and label your matches around what you care about — where we have the data to.",
      ),
    ).toBeInTheDocument();
  });

  it("drops the old rank-everything overpromise", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} eyebrow="Step 1" />);
    expect(screen.queryByText(/shapes how we rank your matches/i)).not.toBeInTheDocument();
  });
});

describe("GoalStep secondary picker (MV-105 Layer A)", () => {
  it("hides the secondary picker until a primary goal is chosen", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} eyebrow="Step 1" />);
    expect(screen.queryByRole("group", { name: /also aiming for/i })).not.toBeInTheDocument();
  });

  it("shows the secondary picker once a primary is chosen", () => {
    render(
      <GoalStep
        profile={{ goal: "permanent-residency" }}
        setField={() => {}}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    expect(screen.getByRole("group", { name: /also aiming for/i })).toBeInTheDocument();
  });

  it("excludes the current primary from the secondary zone", () => {
    render(
      <GoalStep
        profile={{ goal: "permanent-residency" }}
        setField={() => {}}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    const group = screen.getByRole("group", { name: /also aiming for/i });
    // The primary label should not appear as a togglable checkbox inside the secondary zone.
    expect(
      within(group).queryByRole("checkbox", { name: /Permanent residency/i }),
    ).not.toBeInTheDocument();
    // Another goal should be offered.
    expect(within(group).getByRole("checkbox", { name: /Lowest total cost/i })).toBeInTheDocument();
  });

  it("carries one honest line: extra goals add context, no new verdict/matches", () => {
    render(
      <GoalStep
        profile={{ goal: "permanent-residency" }}
        setField={() => {}}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    expect(screen.getByText(/do not combine into a new verdict/i)).toBeInTheDocument();
  });

  it("toggles a secondary goal on via setField", async () => {
    const setField = vi.fn();
    render(
      <GoalStep
        profile={{ goal: "permanent-residency", secondaryGoals: [] }}
        setField={setField}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    const group = screen.getByRole("group", { name: /also aiming for/i });
    await userEvent.click(within(group).getByRole("checkbox", { name: /Lowest total cost/i }));
    expect(setField).toHaveBeenCalledWith({ secondaryGoals: ["lowest-cost"] });
  });

  it("toggles a secondary goal off when it is already selected", async () => {
    const setField = vi.fn();
    render(
      <GoalStep
        profile={{ goal: "permanent-residency", secondaryGoals: ["lowest-cost"] }}
        setField={setField}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    const group = screen.getByRole("group", { name: /also aiming for/i });
    await userEvent.click(within(group).getByRole("checkbox", { name: /Lowest total cost/i }));
    expect(setField).toHaveBeenCalledWith({ secondaryGoals: [] });
  });

  it("reconciles the secondaries when the primary changes to one of them", async () => {
    const setField = vi.fn();
    render(
      <GoalStep
        profile={{ goal: "permanent-residency", secondaryGoals: ["lowest-cost", "highest-ranked"] }}
        setField={setField}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    // Pick "Lowest total cost" as the new PRIMARY — it must be dropped from secondaries
    // in the SAME patch so the two lists stay disjoint.
    await userEvent.click(screen.getByRole("radio", { name: /Lowest total cost/i }));
    expect(setField).toHaveBeenCalledWith({
      goal: "lowest-cost",
      secondaryGoals: ["highest-ranked"],
    });
  });

  it("disables unselected secondary cards at the cap but keeps selected ones togglable", () => {
    render(
      <GoalStep
        profile={{ goal: "permanent-residency", secondaryGoals: ["lowest-cost", "highest-ranked"] }}
        setField={() => {}}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    const group = screen.getByRole("group", { name: /also aiming for/i });
    // A third, unselected option is disabled at the cap of two.
    expect(within(group).getByRole("checkbox", { name: /Fastest admission/i })).toBeDisabled();
    // An already-selected one stays enabled so it can be removed.
    expect(within(group).getByRole("checkbox", { name: /Lowest total cost/i })).not.toBeDisabled();
  });

  it("renders the N of 2 count line", () => {
    render(
      <GoalStep
        profile={{ goal: "permanent-residency", secondaryGoals: ["lowest-cost"] }}
        setField={() => {}}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    expect(screen.getByText(/1 of 2 selected/i)).toBeInTheDocument();
  });
});
