import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("discloses that marking Applied locks in the verdict (MV-34)", () => {
    render(<ShortlistButton programId="p1" initialStatus={null} />);
    expect(screen.getByText(/locks in this verdict/i)).toBeInTheDocument();
  });

  it("does not POST when the already-active status is clicked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);
    await userEvent.click(screen.getByRole("button", { name: "Shortlisted" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// A controllable promise so a test can hold the network "in flight" and assert
// what the pills do BEFORE the server has answered.
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ShortlistButton — optimistic flip + rollback (MV-51)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("flips the pill to the chosen status immediately, before the request resolves", async () => {
    const d = deferred();
    vi.spyOn(globalThis, "fetch").mockReturnValue(d.promise);
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);

    await userEvent.click(screen.getByRole("button", { name: "Applied" }));

    // Request is still pending (never resolved) — the active state can only be
    // optimistic, not driven by the response.
    expect(screen.getByRole("button", { name: "Applied" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Shortlisted" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps every pill clickable while a request is in flight (no disabled lag)", async () => {
    const d = deferred();
    vi.spyOn(globalThis, "fetch").mockReturnValue(d.promise);
    render(<ShortlistButton programId="p1" initialStatus={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Shortlisted" }));

    expect(screen.getByRole("button", { name: "Not saved" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Shortlisted" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Applied" })).not.toBeDisabled();
  });

  it("rolls the pill back to the previous status when the server rejects", async () => {
    const d = deferred();
    vi.spyOn(globalThis, "fetch").mockReturnValue(d.promise);
    render(<ShortlistButton programId="p1" initialStatus="shortlisted" />);

    await userEvent.click(screen.getByRole("button", { name: "Applied" }));
    // optimistic flip happened first
    expect(screen.getByRole("button", { name: "Applied" })).toHaveAttribute("aria-pressed", "true");

    // server says no
    d.resolve(new Response(null, { status: 500 }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shortlisted" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: "Applied" })).toHaveAttribute("aria-pressed", "false");
  });
});
