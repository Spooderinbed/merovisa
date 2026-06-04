import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VerdictGroup } from "@/components/matches/verdict-group";

describe("VerdictGroup", () => {
  it("renders nothing when matches is empty", () => {
    const { container } = render(
      <VerdictGroup verdict="strong" matches={[]} shortlistedIds={new Set()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
