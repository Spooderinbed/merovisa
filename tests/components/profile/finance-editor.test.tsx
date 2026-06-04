import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinanceEditor } from "@/components/profile/editors/finance-editor";

describe("FinanceEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(
      <FinanceEditor
        initial={{ total: 5000000, currency: "NPR", source: "parents", proofUploaded: true }}
      />,
    );
    expect(screen.getByLabelText(/Total funds available/i)).toHaveValue(5000000);
    expect(screen.getByLabelText(/Currency/i)).toHaveValue("NPR");
    expect(screen.getByLabelText(/Source of funds/i)).toHaveValue("parents");
    expect(screen.getByLabelText(/Proof of funds uploaded/i)).toBeChecked();
  });

  it("PATCHes with section finance", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<FinanceEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Total funds available/i), "2500000");
    await userEvent.selectOptions(screen.getByLabelText(/Currency/i), "AUD");
    await userEvent.selectOptions(screen.getByLabelText(/Source of funds/i), "loan");
    await userEvent.click(screen.getByLabelText(/Proof of funds uploaded/i));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.section).toBe("finance");
    expect(body.patch.total).toBe(2500000);
    expect(body.patch.currency).toBe("AUD");
    expect(body.patch.source).toBe("loan");
    expect(body.patch.proofUploaded).toBe(true);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
