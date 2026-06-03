import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tile } from "@/components/marketing/tile";

describe("Tile", () => {
  it("renders the title, body, and (when provided) the badge", () => {
    render(
      <Tile
        title="SOP coach"
        body="Coaching on your own draft."
        badge="Soon"
        iconSvg={<span data-testid="icon" />}
      />,
    );
    expect(screen.getByText("SOP coach")).toBeInTheDocument();
    expect(screen.getByText("Coaching on your own draft.")).toBeInTheDocument();
    expect(screen.getByText("Soon")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("hides the badge slot when no badge is given", () => {
    render(<Tile title="X" body="Y" iconSvg={null} />);
    expect(screen.queryByText("Soon")).toBeNull();
  });
});
