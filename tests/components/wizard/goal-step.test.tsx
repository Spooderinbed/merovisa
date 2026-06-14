import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalStep } from "@/components/wizard/steps/goal-step";

describe("GoalStep copy", () => {
  it("subtext is honest about partial preference coverage", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} />);
    expect(
      screen.getByText(
        "We use this to order and label your matches around what you care about — where we have the data to.",
      ),
    ).toBeInTheDocument();
  });

  it("drops the old rank-everything overpromise", () => {
    render(<GoalStep profile={{}} setField={() => {}} callouts={null} />);
    expect(screen.queryByText(/shapes how we rank your matches/i)).not.toBeInTheDocument();
  });
});
