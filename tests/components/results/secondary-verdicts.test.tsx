import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SecondaryVerdicts } from "@/components/results/secondary-verdicts";
import type { SecondaryVerdicts as SecondaryVerdictsData } from "@/lib/results/secondary-verdicts";

const pivotData: SecondaryVerdictsData = {
  primary: { label: "Computer Science", verdict: "possible" },
  items: [
    { field: "business", label: "Business", verdict: "strong", outranksPrimary: true },
    { field: "data-science", label: "Data Science", verdict: "possible", outranksPrimary: false },
  ],
  pivot: { field: "business", label: "Business", verdict: "strong", outranksPrimary: true },
};

const noPivotData: SecondaryVerdictsData = {
  primary: { label: "Business", verdict: "strong" },
  items: [
    { field: "computer-science", label: "Computer Science", verdict: "possible", outranksPrimary: false },
    { field: "data-science", label: "Data Science", verdict: "reach", outranksPrimary: false },
  ],
  pivot: null,
};

describe("SecondaryVerdicts", () => {
  it("renders nothing for null", () => {
    const { container } = render(<SecondaryVerdicts data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined", () => {
    const { container } = render(<SecondaryVerdicts data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when items is empty", () => {
    const { container } = render(
      <SecondaryVerdicts data={{ primary: { label: "Computer Science", verdict: "possible" }, items: [], pivot: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one conditional row per item with the field label and band word", () => {
    render(<SecondaryVerdicts data={pivotData} />);
    // Each row restates the hypothetical in the same visual unit as the pill.
    expect(screen.getByText(/If you applied under Business instead/i)).toBeInTheDocument();
    expect(screen.getByText(/If you applied under Data Science instead/i)).toBeInTheDocument();
    // Band words come from VERDICT_LABELS (strong → "Strong match", possible → "Possible").
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.getByText("Possible")).toBeInTheDocument();
  });

  it("paints each pill with the verdict's colour class", () => {
    render(<SecondaryVerdicts data={pivotData} />);
    expect(screen.getByText("Strong match").className).toContain("bg-strong-tint");
    expect(screen.getByText("Strong match").className).toContain("text-strong");
    expect(screen.getByText("Possible").className).toContain("bg-possible-tint");
    expect(screen.getByText("Possible").className).toContain("text-possible-ink");
  });

  it("renders the pills static — no primary-card reveal animation", () => {
    const { container } = render(<SecondaryVerdicts data={pivotData} />);
    expect(container.innerHTML).not.toContain("animate-rise");
    expect(container.innerHTML).not.toContain("animate-settle");
  });

  it("shows a role=note pivot callout naming the stronger band in words", () => {
    render(<SecondaryVerdicts data={pivotData} />);
    const notes = screen.getAllByRole("note");
    const callout = notes.map((n) => n.textContent ?? "").join(" ");
    // The meaning is carried by the words, not a colour tint alone.
    expect(callout).toMatch(/Business/);
    expect(callout).toMatch(/Strong/);
    // Low-pressure framing — no editorial "realistic path", no cost/visa promise.
    expect(callout).not.toMatch(/realistic path/i);
    expect(callout).not.toMatch(/cheaper|cost|visa/i);
  });

  it("renders no pivot callout when nothing outranks the primary", () => {
    render(<SecondaryVerdicts data={noPivotData} />);
    // Rows still render, but no callout — the section label is not a note.
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText(/If you applied under Computer Science instead/i)).toBeInTheDocument();
  });
});
