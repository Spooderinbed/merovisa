import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortlistButton } from "@/components/matches/shortlist-button";

describe("ShortlistButton", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders 'Shortlist' when not shortlisted", () => {
    render(<ShortlistButton programId="p1" initialStatus={null} />);
    expect(screen.getByRole("button", { name: /Shortlist/i })).toBeInTheDocument();
  });

  it("POSTs status=shortlisted on click and updates label", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<ShortlistButton programId="p1" initialStatus={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Shortlist/i }));
    expect(await screen.findByText(/Shortlisted/i)).toBeInTheDocument();
  });

  it("POSTs status=null on click when already shortlisted", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);
    await userEvent.click(screen.getByRole("button", { name: /Shortlisted/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.status).toBeNull();
  });
});
