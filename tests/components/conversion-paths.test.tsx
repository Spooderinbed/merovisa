import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

import { ConversionPaths } from "@/components/results/conversion-paths";

describe("ConversionPaths", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
  });

  it("renders the 3-day urgency copy and a Google button", () => {
    render(<ConversionPaths assessmentId="aid-1" />);
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("starts Google OAuth with the claim id in redirectTo", async () => {
    render(<ConversionPaths assessmentId="aid-1" />);
    await userEvent.click(screen.getByRole("button", { name: /Continue with Google/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback?claim=aid-1"),
        }),
      }),
    );
  });

  it("posts a lead and acknowledges it inline", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    render(<ConversionPaths assessmentId="aid-1" />);
    await userEvent.type(screen.getByLabelText(/Email me my results/i), "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Email me my results/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/leads", expect.objectContaining({ method: "POST" }));
    expect(await screen.findByText(/We'll send your results to student@example.com/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("disables the Google button when there is no assessment id", () => {
    render(<ConversionPaths assessmentId={null} />);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeDisabled();
  });
});
