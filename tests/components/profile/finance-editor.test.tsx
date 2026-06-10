import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinanceEditor } from "@/components/profile/editors/finance-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("FinanceEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(
      <FinanceEditor
        initial={{ total: 5000000, currency: "NPR", source: "parents-family", proofUploaded: true }}
      />,
    );
    expect(screen.getByLabelText(/Total funds available/i)).toHaveValue(5000000);
    expect(screen.getByLabelText(/Currency/i)).toHaveValue("NPR");
    expect(screen.getByLabelText(/Source of funds/i)).toHaveValue("parents-family");
  });

  it("shows Documents page hint", () => {
    render(<FinanceEditor initial={{}} />);
    const link = screen.getByRole("link", { name: /Documents page/i });
    expect(link).toHaveAttribute("href", "/documents");
  });

  it("names the DHA-accepted funding paths with a source link", () => {
    render(<FinanceEditor initial={{}} />);
    const link = screen.getByRole("link", { name: /DHA student visa page/i });
    expect(link.getAttribute("href")).toContain("student-500");
    const p = link.closest("p")!;
    expect(p.textContent).toContain("DHA accepts");
    expect(p.textContent).toContain("money deposit");
    expect(p.textContent).toContain("education loan");
    expect(p.textContent).toContain("scholarship or sponsorship");
    expect(p.textContent).toContain("parent or partner income");
  });

  it("PATCHes with section finance", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<FinanceEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Total funds available/i), "2500000");
    await userEvent.selectOptions(screen.getByLabelText(/Currency/i), "AUD");
    await userEvent.selectOptions(screen.getByLabelText(/Source of funds/i), "education-loan");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("finance");
    expect(body.patch.total).toBe(2500000);
    expect(body.patch.currency).toBe("AUD");
    expect(body.patch.source).toBe("education-loan");
    expect(body.patch.proofUploaded).toBeUndefined();
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
