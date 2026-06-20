import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortlistButton } from "@/components/matches/shortlist-button";

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const firstBody = (mock: ReturnType<typeof vi.spyOn>) =>
  JSON.parse((mock.mock.calls[0]![1] as RequestInit).body as string);

describe("ShortlistButton (3-state status control)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders the three states: Not saved / Shortlisted / Applied", () => {
    render(<ShortlistButton programId="p1" initialStatus={null} />);
    expect(screen.getByRole("button", { name: "Not saved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shortlisted" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Applied" })).toBeInTheDocument();
  });

  it("marks the current status active", () => {
    render(<ShortlistButton programId="p1" initialStatus="applied" />);
    expect(screen.getByRole("button", { name: "Applied" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Shortlisted" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("POSTs status=shortlisted when Shortlisted is chosen from Not saved", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    render(<ShortlistButton programId="p1" initialStatus={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Shortlisted" }));
    expect(firstBody(fetchMock)).toEqual({ programId: "p1", status: "shortlisted" });
    expect(await screen.findByRole("button", { name: "Shortlisted" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("POSTs status=applied when Applied is chosen (the MV-08 capture trigger)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);
    await userEvent.click(screen.getByRole("button", { name: "Applied" }));
    expect(firstBody(fetchMock)).toEqual({ programId: "p1", status: "applied" });
    expect(await screen.findByRole("button", { name: "Applied" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("POSTs status=null when Not saved is chosen", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);
    await userEvent.click(screen.getByRole("button", { name: "Not saved" }));
    expect(firstBody(fetchMock).status).toBeNull();
  });

  it("does not POST when the already-active status is clicked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);
    await userEvent.click(screen.getByRole("button", { name: "Shortlisted" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
