import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnglishStep } from "@/components/wizard/steps/english-step";

describe("EnglishStep", () => {
  it("defaults a score when 'Taken' is chosen and clears it otherwise", async () => {
    const setField = vi.fn();
    render(<EnglishStep profile={{ englishStatus: "taken", englishScore: 6.5 }} setField={setField} callouts={null} />);
    await userEvent.click(screen.getByRole("radio", { name: "Not taken" }));
    expect(setField).toHaveBeenCalledWith({ englishStatus: "not-taken", englishScore: undefined });
  });

  it("shows the band slider only when status is taken", () => {
    const { rerender } = render(
      <EnglishStep profile={{ englishStatus: "not-taken" }} setField={vi.fn()} callouts={null} />,
    );
    expect(screen.queryByRole("slider", { name: "IELTS band" })).toBeNull();
    rerender(<EnglishStep profile={{ englishStatus: "taken", englishScore: 6.5 }} setField={vi.fn()} callouts={null} />);
    expect(screen.getByRole("slider", { name: "IELTS band" })).toBeInTheDocument();
  });

  it("emits a numeric band when the slider moves", () => {
    const setField = vi.fn();
    render(<EnglishStep profile={{ englishStatus: "taken", englishScore: 6.5 }} setField={setField} callouts={null} />);
    fireEvent.change(screen.getByRole("slider", { name: "IELTS band" }), { target: { value: "7" } });
    expect(setField).toHaveBeenCalledWith({ englishScore: 7 });
  });
});
