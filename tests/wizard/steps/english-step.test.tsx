import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnglishStep } from "@/components/wizard/steps/english-step";

describe("EnglishStep", () => {
  it("defaults a score when 'Taken' is chosen and clears it otherwise", async () => {
    const setField = vi.fn();
    render(<EnglishStep profile={{ englishStatus: "taken", englishScore: 6.5 }} setField={setField} callouts={null} eyebrow="Step 1" />);
    await userEvent.click(screen.getByRole("radio", { name: "Not taken" }));
    expect(setField).toHaveBeenCalledWith({ englishStatus: "not-taken", englishScore: undefined });
  });

  it("shows the band slider only when status is taken", () => {
    const { rerender } = render(
      <EnglishStep profile={{ englishStatus: "not-taken" }} setField={vi.fn()} callouts={null} eyebrow="Step 1" />,
    );
    expect(screen.queryByRole("slider", { name: "IELTS band" })).toBeNull();
    rerender(<EnglishStep profile={{ englishStatus: "taken", englishScore: 6.5 }} setField={vi.fn()} callouts={null} eyebrow="Step 1" />);
    expect(screen.getByRole("slider", { name: "IELTS band" })).toBeInTheDocument();
  });

  it("emits a numeric band when the slider moves", () => {
    const setField = vi.fn();
    render(<EnglishStep profile={{ englishStatus: "taken", englishScore: 6.5 }} setField={setField} callouts={null} eyebrow="Step 1" />);
    fireEvent.change(screen.getByRole("slider", { name: "IELTS band" }), { target: { value: "7" } });
    expect(setField).toHaveBeenCalledWith({ englishScore: 7 });
  });

  it("shows the live IELTS equivalent for a PTE score — the same mapping scoring uses", () => {
    render(
      <EnglishStep
        profile={{ englishStatus: "taken", englishTest: "pte", englishScore: 58 }}
        setField={vi.fn()}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    expect(screen.getByText(/≈ IELTS 6\.5 equivalent/)).toBeInTheDocument();
  });

  it("shows no equivalent line for IELTS itself", () => {
    render(
      <EnglishStep
        profile={{ englishStatus: "taken", englishTest: "ielts", englishScore: 6.5 }}
        setField={vi.fn()}
        callouts={null}
        eyebrow="Step 1"
      />,
    );
    expect(screen.queryByText(/equivalent/i)).toBeNull();
  });

  it("is transparent about the provisional baseline when no test is taken yet", () => {
    render(
      <EnglishStep profile={{ englishStatus: "not-taken" }} setField={vi.fn()} callouts={null} eyebrow="Step 1" />,
    );
    expect(screen.getByText(/6\.0/)).toBeInTheDocument();
  });
});
