import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VerdictGroup } from "@/components/matches/verdict-group";

describe("VerdictGroup", () => {
  it("renders nothing when matches is empty", () => {
    const { container } = render(
      <VerdictGroup verdict="strong" matches={[]} statusById={new Map()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("sources its group header wording from the central VERDICT_LABELS map, not a local dict (MV-42)", () => {
    const src = readFileSync(join(process.cwd(), "components/matches/verdict-group.tsx"), "utf8");
    expect(src).toMatch(/VERDICT_LABELS/);
    // The component's own divergent HEADLINE dict is gone.
    expect(src).not.toMatch(/HEADLINE/);
  });
});
