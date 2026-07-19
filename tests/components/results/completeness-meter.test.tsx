import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletenessMeter } from "@/components/results/completeness-meter";
import type { ProfileCompleteness } from "@/lib/results/completeness";

const started: ProfileCompleteness = {
  completeness: 17,
  level: "Started",
  suggestions: [{ id: "english", label: "Add your English score", gain: "so your verdict uses your real score" }],
};

describe("CompletenessMeter (audit C-6: honest completeness, not fake accuracy)", () => {
  it("labels the concept 'completeness', never 'accuracy' or 'confidence'", () => {
    const { container } = render(<CompletenessMeter completeness={started} />);
    expect(screen.getByText(/Profile completeness/i)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/accuracy/i);
    expect(container.textContent ?? "").not.toMatch(/confidence/i);
    expect(container.textContent ?? "").not.toMatch(/verif/i);
  });

  it("shows the neutral tier name and no raw percentage number", () => {
    const { container } = render(<CompletenessMeter completeness={started} />);
    expect(screen.getByText(/Started/)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d+\s*%/);
  });

  it("renders the 'Full picture' tier for a complete profile", () => {
    render(
      <CompletenessMeter completeness={{ completeness: 100, level: "Full picture", suggestions: [] }} />,
    );
    expect(screen.getByText(/Full picture/)).toBeInTheDocument();
  });

  it("lists each suggestion label and its honest gain", () => {
    render(<CompletenessMeter completeness={started} />);
    expect(screen.getByText(/Add your English score/i)).toBeInTheDocument();
    expect(screen.getByText(/so your verdict uses your real score/i)).toBeInTheDocument();
  });

  it("colours the fill with the primary token, not the verdict-amber accent", () => {
    const { container } = render(<CompletenessMeter completeness={started} />);
    const fill = container.querySelector("[data-completeness-fill]") as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill?.className).toContain("bg-primary");
    expect(fill?.className).not.toContain("bg-accent");
  });

  it("bands the fill to coarse quartile steps and never over-reads (floor)", () => {
    // 17 floors to 0% (barely started), 92 floors to 75% (not a full bar until truly full).
    const { container } = render(<CompletenessMeter completeness={started} />);
    expect((container.querySelector("[data-completeness-fill]") as HTMLElement).style.width).toBe("0%");

    const { container: c92 } = render(
      <CompletenessMeter completeness={{ completeness: 92, level: "Detailed", suggestions: [] }} />,
    );
    expect((c92.querySelector("[data-completeness-fill]") as HTMLElement).style.width).toBe("75%");

    const { container: c100 } = render(
      <CompletenessMeter completeness={{ completeness: 100, level: "Full picture", suggestions: [] }} />,
    );
    expect((c100.querySelector("[data-completeness-fill]") as HTMLElement).style.width).toBe("100%");
  });

  it("omits the suggestion list entirely when the picture is complete", () => {
    render(<CompletenessMeter completeness={{ completeness: 100, level: "Full picture", suggestions: [] }} />);
    expect(screen.queryByText(/Add more of your picture/i)).toBeNull();
  });
});
