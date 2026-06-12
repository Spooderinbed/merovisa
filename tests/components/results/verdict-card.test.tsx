import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VerdictCard } from "@/components/results/verdict-card";
import { CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";

describe("VerdictCard provenance line (F16)", () => {
  it("renders 'Assessment rules verified {date}' from the payload-carried prop", () => {
    render(<VerdictCard verdict="possible" rulesVerified={CONFIG_RULES_VERIFIED} />);
    expect(screen.getByText(`Assessment rules verified ${CONFIG_RULES_VERIFIED}`)).toBeInTheDocument();
    // The old framing and its single-host attribution are gone: the date is the
    // scoring config's floor, and no one domain covers the mixed rule inputs.
    expect(screen.queryByText(/Based on rules verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/immi\.homeaffairs\.gov\.au/i)).not.toBeInTheDocument();
  });

  it("renders no provenance line for legacy payloads without the field", () => {
    render(<VerdictCard verdict="possible" />);
    expect(screen.queryByText(/rules verified/i)).not.toBeInTheDocument();
  });

  it("takes its date from the scoring config, not the destination config (structural)", () => {
    // Both dates are currently the same string, so a rendered-text comparison
    // can't distinguish the source — assert the wiring itself: the card no
    // longer references the destination record at all.
    const src = readFileSync(join(process.cwd(), "components/results/verdict-card.tsx"), "utf8");
    expect(src).not.toMatch(/destination\/australia/);
    expect(src).toMatch(/rulesVerified/);
  });
});
