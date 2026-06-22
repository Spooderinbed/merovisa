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

describe("VerdictCard lowest-band severity honesty (audit fix #5)", () => {
  it("does not soften a near-zero reach with 'a few key areas'", () => {
    // A 3-out-of-100 student must not read the same gentle line as a borderline one.
    render(<VerdictCard verdict="reach" weighted={3} />);
    expect(screen.queryByText(/a few key areas/i)).toBeNull();
  });

  it("scales the reach copy to the severity carried in the weighted prop", () => {
    const { container: severe } = render(<VerdictCard verdict="reach" weighted={3} />);
    const severeLine = severe.querySelector("h2")?.textContent ?? "";

    const { container: mild } = render(<VerdictCard verdict="reach" weighted={48} />);
    const mildLine = mild.querySelector("h2")?.textContent ?? "";

    // The two reach copies must differ — one band can't speak with one voice across
    // a 3/100 and a 48/100 profile.
    expect(severeLine).not.toBe("");
    expect(mildLine).not.toBe("");
    expect(severeLine).not.toBe(mildLine);

    // Neither variant leaks a raw number to the user.
    expect(severeLine).not.toMatch(/\d/);
    expect(mildLine).not.toMatch(/\d/);
  });

  it("falls back to the standard reach line when no weighted prop is given (legacy payloads)", () => {
    render(<VerdictCard verdict="reach" />);
    // Without a severity signal the card stays on the existing, non-alarming copy.
    expect(screen.getByText(/ambitious/i)).toBeInTheDocument();
  });

  it("leaves the strong/possible bands untouched", () => {
    render(<VerdictCard verdict="possible" weighted={3} />);
    expect(screen.getByText(/realistic shot/i)).toBeInTheDocument();
  });
});
