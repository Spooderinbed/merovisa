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

  it("degrades the verdict visibly when a scoring rule is stale, replacing the calm verified line (MV-04)", () => {
    render(<VerdictCard verdict="strong" rulesVerified={CONFIG_RULES_VERIFIED} rulesStale />);
    // The stale state warns + lowers confidence instead of presenting the verdict as current.
    expect(screen.getByText(/overdue for re-verification/i)).toBeInTheDocument();
    // The calm "Assessment rules verified {date}" line must not also render — a
    // stale verdict can't show a reassuring as-of date as if it were current.
    expect(
      screen.queryByText(`Assessment rules verified ${CONFIG_RULES_VERIFIED}`),
    ).not.toBeInTheDocument();
  });

  it("renders the calm verified line (not the degrade) when rules are fresh", () => {
    render(<VerdictCard verdict="strong" rulesVerified={CONFIG_RULES_VERIFIED} rulesStale={false} />);
    expect(screen.getByText(`Assessment rules verified ${CONFIG_RULES_VERIFIED}`)).toBeInTheDocument();
    expect(screen.queryByText(/overdue for re-verification/i)).not.toBeInTheDocument();
  });

  it("always carries the not-immigration-advice boundary (MV-05)", () => {
    render(<VerdictCard verdict="strong" />);
    expect(screen.getByText(/not immigration advice/i)).toBeInTheDocument();
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
