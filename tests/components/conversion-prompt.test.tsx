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

  it("disables the button when there is no assessment id", () => {
    render(<ConversionPrompt assessmentId={null} />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeDisabled();
  });
});
