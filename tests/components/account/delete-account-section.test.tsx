import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountSection } from "@/components/account/delete-account-section";

describe("DeleteAccountSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the destructive button disabled until the user types the confirm word", async () => {
    render(<DeleteAccountSection />);
    const btn = screen.getByRole("button", { name: /delete my account/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "delete");
    // Case-insensitive, trimmed — "delete" still arms it.
    expect(btn).toBeEnabled();
  });

  it("posts to the deletion endpoint once armed and confirmed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { href: "" });
    render(<DeleteAccountSection />);
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/account/delete", { method: "POST" }),
    );
  });

  it("surfaces an error and stays put when the deletion fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    render(<DeleteAccountSection />);
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    expect(await screen.findByText(/couldn't delete your account/i)).toBeInTheDocument();
  });
});
