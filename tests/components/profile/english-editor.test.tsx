import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnglishEditor } from "@/components/profile/editors/english-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("EnglishEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<EnglishEditor initial={{ test: "ielts", overall: 7, reportUploaded: true }} />);
    expect(screen.getByLabelText(/Test/i)).toHaveValue("ielts");
    expect(screen.getByLabelText(/Overall score/i)).toHaveValue(7);
  });

  it("shows Documents page hint", () => {
    render(<EnglishEditor initial={{}} />);
    const link = screen.getByRole("link", { name: /Documents page/i });
    expect(link).toHaveAttribute("href", "/documents");
  });

  it("PATCHes with section english", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<EnglishEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Test/i), "ielts");
    await userEvent.type(screen.getByLabelText(/Overall score/i), "7.5");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("english");
    expect(body.patch.test).toBe("ielts");
    expect(body.patch.overall).toBe(7.5);
    expect(body.patch.reportUploaded).toBeUndefined();
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<EnglishEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Test/i), "pte");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });

  // Per-band inputs are IELTS-scale (0–9). PTE and TOEFL report an overall only, so the
  // four sub-band inputs are meaningless there — showing 0–9 boxes invites an IELTS band
  // typed under a PTE test. Hide them for non-IELTS; keep them for IELTS.
  it("hides the IELTS per-band sub-inputs when the test is PTE (PTE reports overall only)", () => {
    render(<EnglishEditor initial={{ test: "pte", overall: 58 }} />);
    expect(screen.getByLabelText(/Overall score/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Listening/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reading/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Writing/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Speaking/i)).not.toBeInTheDocument();
  });

  it("hides the per-band sub-inputs for TOEFL too", () => {
    render(<EnglishEditor initial={{ test: "toefl", overall: 90 }} />);
    expect(screen.queryByLabelText(/Listening/i)).not.toBeInTheDocument();
  });

  it("shows the per-band sub-inputs for IELTS (each band is an IELTS 0–9 score)", () => {
    render(<EnglishEditor initial={{ test: "ielts", overall: 7 }} />);
    expect(screen.getByLabelText(/Listening/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Speaking/i)).toBeInTheDocument();
  });

  it("does not save stale IELTS per-band values once the test is PTE", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    // A profile that once held IELTS bands, now switched to PTE: the hidden bands must
    // not be written as if they were PTE sub-scores.
    render(<EnglishEditor initial={{ test: "pte", overall: 58, listening: 7, reading: 7 }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.patch.test).toBe("pte");
    expect(body.patch.overall).toBe(58);
    expect(body.patch.listening).toBeUndefined();
    expect(body.patch.reading).toBeUndefined();
    fetchMock.mockRestore();
  });
});
