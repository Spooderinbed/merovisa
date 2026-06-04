import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GapEditor } from "@/components/profile/editors/gap-editor";

describe("GapEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<GapEditor initial={{ years: 2, reasons: ["worked", "health-family"], evidence: ["pay slip", "letter"] }} />);
    expect(screen.getByLabelText(/Years of gap/i)).toHaveValue(2);
    expect(screen.getByLabelText(/Worked/i)).toBeChecked();
    expect(screen.getByLabelText(/Health or family/i)).toBeChecked();
    expect(screen.getByLabelText(/Evidence/i)).toHaveValue("pay slip, letter");
  });

  it("PATCHes with section gap", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<GapEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Years of gap/i), "3");
    await userEvent.click(screen.getByLabelText(/Worked/i));
    await userEvent.click(screen.getByLabelText(/Health or family/i));
    await userEvent.type(screen.getByLabelText(/Evidence/i), "doc1, doc2");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("gap");
    expect(body.patch.years).toBe(3);
    expect(body.patch.reasons).toEqual(expect.arrayContaining(["worked", "health-family"]));
    expect(body.patch.evidence).toEqual(["doc1", "doc2"]);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<GapEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Years of gap/i), "1");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
