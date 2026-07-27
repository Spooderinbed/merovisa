import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.CLAIM_HMAC_SECRET = "test-secret-must-be-32-chars-long-abc";
});

const { claimAndBootstrapProfile } = vi.hoisted(() => ({ claimAndBootstrapProfile: vi.fn() }));
vi.mock("@/lib/assessments/claim", () => ({ claimAndBootstrapProfile }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ tag: "admin" }) }));

import { signClaim } from "@/lib/auth/hmac-claim";
import { resolveSignInDestination } from "@/lib/auth/finish-sign-in";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";
const validClaim = () => signClaim(ASSESSMENT_UUID, Date.now() + 60_000);

describe("resolveSignInDestination", () => {
  beforeEach(() => claimAndBootstrapProfile.mockReset());

  it("claims the assessment and lands the user on it", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: true });
    const dest = await resolveSignInDestination(
      { id: "user-1", email: "aarav@example.com", user_metadata: { full_name: "Aarav" } },
      { claim: validClaim() },
    );
    expect(dest).toBe(`/assessment/${ASSESSMENT_UUID}`);
    expect(claimAndBootstrapProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assessmentId: ASSESSMENT_UUID,
        userId: "user-1",
        googleName: "Aarav",
        email: "aarav@example.com",
      }),
    );
  });

  // The honesty guarantee for MV-147: an email-auth user has no provider display
  // name, but must otherwise claim the SAME row and land on the SAME page as a
  // Google user. If these two ever diverge, "sign in with email" has quietly
  // become a second-class path and the anonymous-recovery contract is broken.
  it("resolves identically for an email-auth user with no provider display name", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: true });
    const token = validClaim();

    const google = await resolveSignInDestination(
      { id: "user-1", email: "aarav@example.com", user_metadata: { full_name: "Aarav" } },
      { claim: token },
    );
    const email = await resolveSignInDestination(
      { id: "user-1", email: "aarav@example.com", user_metadata: {} },
      { claim: token },
    );

    expect(email).toBe(google);
    const [, googleArgs] = claimAndBootstrapProfile.mock.calls[0]!;
    const [, emailArgs] = claimAndBootstrapProfile.mock.calls[1]!;
    expect(emailArgs.assessmentId).toBe(googleArgs.assessmentId);
    expect(emailArgs.userId).toBe(googleArgs.userId);
    expect(emailArgs.email).toBe(googleArgs.email);
    expect(emailArgs.googleName).toBeUndefined();
  });

  it("sends the user to /assess?error=expired when the row can no longer be claimed", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false });
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: validClaim() });
    expect(dest).toBe("/assess?error=expired");
  });

  it("rejects an unsigned (raw) claim without touching the claim path", async () => {
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: ASSESSMENT_UUID });
    expect(dest).toBe("/assess?error=invalid-claim");
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("rejects an expired signed claim without touching the claim path", async () => {
    const expired = signClaim(ASSESSMENT_UUID, Date.now() - 1000);
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: expired });
    expect(dest).toBe("/assess?error=invalid-claim");
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });

  it("falls back to /dashboard when there is no claim", async () => {
    expect(await resolveSignInDestination({ id: "user-1" }, {})).toBe("/dashboard");
  });

  it("honors a relative next path", async () => {
    expect(await resolveSignInDestination({ id: "user-1" }, { next: "/profile" })).toBe("/profile");
  });

  it("rejects a protocol-relative next path", async () => {
    const dest = await resolveSignInDestination({ id: "user-1" }, { next: "//attacker.com" });
    expect(dest).toBe("/dashboard");
  });

  it("never claims when the session has no user", async () => {
    const dest = await resolveSignInDestination(null, { claim: validClaim() });
    expect(dest).toBe("/dashboard");
    expect(claimAndBootstrapProfile).not.toHaveBeenCalled();
  });
});
