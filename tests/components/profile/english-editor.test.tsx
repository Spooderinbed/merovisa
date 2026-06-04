import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnglishEditor } from "@/components/profile/editors/english-editor";

describe("EnglishEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<EnglishEditor initial={{ test: "ielts", overall: 7, reportUploaded: true }} />);
    expect(screen.getByLabelText(/Test/i)).toHaveValue("ielts");
    expect(screen.getByLabelText(/Overall score/i)).toHaveValue(7);
    expect(screen.getByLabelText(/Score report uploaded/i)).toBeChecked();
  });

  it("PATCHes with section english", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<EnglishEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Test/i), "ielts");
    await userEvent.type(screen.getByLabelText(/Overall score/i), "7.5");
    await userEvent.click(screen.getByLabelText(/Score report uploaded/i));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.section).toBe("english");
    expect(body.patch.test).toBe("ielts");
    expect(body.patch.overall).toBe(7.5);
    expect(body.patch.reportUploaded).toBe(true);
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
});
