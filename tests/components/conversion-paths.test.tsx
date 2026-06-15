import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

import { ConversionPaths } from "@/components/results/conversion-paths";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";
const FAKE_CLAIM_TOKEN = "11815637-f603-4821-8dd0-d9e52560c4f6.9999999999999.fakesig";

describe("ConversionPaths", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
  });

  it("renders the 3-day urgency copy and a Google button", () => {
    render(<ConversionPaths assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("fetches a signed claim token and includes it in the OAuth redirectTo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (typeof input === "string" && input.includes("sign-claim")) {
        return Promise.resolve(new Response(JSON.stringify({ token: FAKE_CLAIM_TOKEN }), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    render(<ConversionPaths assessmentId={ASSESSMENT_UUID} />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/results/sign-claim",
      expect.objectContaining({ method: "POST" }),
    );
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining(`/auth/callback?claim=${encodeURIComponent(FAKE_CLAIM_TOKEN)}`),
        }),
      }),
    );
    fetchMock.mockRestore();
  });

  it("proceeds without claim in redirectTo when sign-claim fetch fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    render(<ConversionPaths assessmentId={ASSESSMENT_UUID} />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));

    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback"),
        }),
      }),
    );
    // No claim param when signing failed
    const callArg = signInWithOAuth.mock.calls[0]?.[0];
    expect(callArg?.options?.redirectTo).not.toContain("claim=");
    fetchMock.mockRestore();
  });

  it("offers no email-delivery or come-back-later path (no send/retrieval system exists)", () => {
    render(<ConversionPaths assessmentId={ASSESSMENT_UUID} />);
    expect(screen.queryByText(/Email me my results/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/come back later/i)).not.toBeInTheDocument();
  });

  it("disables the Google button when there is no assessment id", () => {
    render(<ConversionPaths assessmentId={null} />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeDisabled();
  });
});
