import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentCard } from "@/components/documents/document-card";
import { DocumentViewerModal } from "@/components/documents/document-viewer-modal";
import type { DocumentKindMeta } from "@/lib/documents/types";

const meta = { kind: "passport", label: "Passport" } as unknown as DocumentKindMeta;
const initial = { id: "d1", originalName: "passport.png", fileSize: 1024 };

describe("DocumentCard upload control", () => {
  it("accepts PDFs in the file picker — transcripts, offers, and loan letters are PDFs", () => {
    const { container } = render(<DocumentCard meta={meta} initial={null} />);
    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute("accept")).toContain("application/pdf");
  });
});

describe("DocumentViewerModal", () => {
  it("renders a PDF in an iframe, not a broken image", () => {
    render(
      <DocumentViewerModal url="https://x/doc.pdf" label="Offer letter" isPdf onClose={() => {}} />,
    );
    // The iframe is reachable by its title; no <img> is rendered for a PDF.
    expect(screen.getByTitle(/offer letter/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders an image document in an img", () => {
    render(<DocumentViewerModal url="https://x/p.png" label="Passport" onClose={() => {}} />);
    expect(screen.getByRole("img", { name: /passport/i })).toBeInTheDocument();
  });
});

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
