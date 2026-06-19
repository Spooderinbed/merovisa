import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentCard } from "@/components/documents/document-card";
import type { DocumentKindMeta } from "@/lib/documents/types";

const meta = { kind: "passport", label: "Passport" } as unknown as DocumentKindMeta;
const initial = { id: "d1", originalName: "passport.png", fileSize: 1024 };

describe("DocumentCard delete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the document and surfaces an error when the delete request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<DocumentCard meta={meta} initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(await screen.findByText(/couldn.t delete/i)).toBeInTheDocument();
    // The uploaded card is still shown — nothing was actually removed.
    expect(screen.getByText(/uploaded/i)).toBeInTheDocument();
  });

  it("removes the document when the delete succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<DocumentCard meta={meta} initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() => expect(screen.queryByText(/uploaded/i)).not.toBeInTheDocument());
  });
});
