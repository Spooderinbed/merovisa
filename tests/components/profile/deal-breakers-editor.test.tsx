import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DealBreakersEditor } from "@/components/profile/editors/deal-breakers-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("DealBreakersEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders initial mustHaves as checked", () => {
    render(<DealBreakersEditor initial={{ mustHaves: ["pr-friendly", "work-rights"] }} />);
    expect(screen.getByLabelText(/PR-friendly/i)).toBeChecked();
    expect(screen.getByLabelText(/Work rights during study/i)).toBeChecked();
    expect(screen.getByLabelText(/Affordable tuition/i)).not.toBeChecked();
  });

  it("PATCHes with section deal-breakers and toggled mustHaves", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<DealBreakersEditor initial={{}} />);
    await userEvent.click(screen.getByLabelText(/PR-friendly/i));
    await userEvent.click(screen.getByLabelText(/Affordable tuition/i));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("deal-breakers");
    expect(body.patch.mustHaves).toEqual(expect.arrayContaining(["pr-friendly", "affordable"]));
    expect(body.patch.mustHaves).toHaveLength(2);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
