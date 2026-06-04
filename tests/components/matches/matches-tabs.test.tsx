import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchesTabs } from "@/components/matches/matches-tabs";

describe("MatchesTabs", () => {
  it("renders universities tab by default", () => {
    render(
      <MatchesTabs
        universities={<div data-testid="uni">U</div>}
        scholarships={<div data-testid="sch">S</div>}
        cost={<div data-testid="co">C</div>}
      />,
    );
    expect(screen.getByTestId("uni")).toBeInTheDocument();
    expect(screen.queryByTestId("sch")).toBeNull();
  });

  it("switches to scholarships on click", async () => {
    render(
      <MatchesTabs
        universities={<div data-testid="uni">U</div>}
        scholarships={<div data-testid="sch">S</div>}
        cost={<div data-testid="co">C</div>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Scholarships/i }));
    expect(screen.queryByTestId("uni")).toBeNull();
    expect(screen.getByTestId("sch")).toBeInTheDocument();
  });
});
