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
      render(<ConversionPrompt assessmentId={null} onRetrySave={() => {}} />);
      expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue with Google/i })).not.toBeInTheDocument();
    });

    it("retries the save in place via a button — not a link that wipes the wizard and results", async () => {
      const onRetrySave = vi.fn();
      render(<ConversionPrompt assessmentId={null} onRetrySave={onRetrySave} />);
      // The old "Run it again" link routed to /assess?new=1, which cleared the
      // wizard + results and forced a full re-answer. The recovery is now in-place.
      expect(screen.queryByRole("link", { name: /run it again/i })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /try saving again/i }));
      expect(onRetrySave).toHaveBeenCalledTimes(1);
    });

    it("disables the retry button while a save is in flight", () => {
      render(<ConversionPrompt assessmentId={null} onRetrySave={() => {}} retryingSave />);
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });
  });
});
