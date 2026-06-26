import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { startClaimOAuth } = vi.hoisted(() => ({ startClaimOAuth: vi.fn() }));
vi.mock("@/lib/auth/start-claim-oauth", () => ({ startClaimOAuth }));

import { ConversionPrompt } from "@/components/results/conversion-prompt";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

describe("ConversionPrompt", () => {
  beforeEach(() => {
    startClaimOAuth.mockReset();
  });

  it("renders a compact Google CTA near the verdict", () => {
    render(<ConversionPrompt assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("starts Google OAuth via the shared sign-claim flow on click", async () => {
    render(<ConversionPrompt assessmentId={ASSESSMENT_UUID} />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    expect(startClaimOAuth).toHaveBeenCalledWith(ASSESSMENT_UUID);
  });

  describe("when the assessment failed to persist (id:null)", () => {
    it("shows an honest could-not-save message instead of a dead Continue button", () => {
      render(<ConversionPrompt assessmentId={null} />);
      expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue with Google/i })).not.toBeInTheDocument();
    });

    it("offers a real recovery: a link to run the assessment again", () => {
      render(<ConversionPrompt assessmentId={null} />);
      const retry = screen.getByRole("link", { name: /run it again/i });
      expect(retry).toHaveAttribute("href", "/assess?new=1");
    });
  });
});
