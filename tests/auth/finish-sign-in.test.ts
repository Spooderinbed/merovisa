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
      // MV-158: the VERIFIED session object goes in whole. There is no
      // `userId`, no `googleName` and no `email` parameter — identity is derived
      // inside `ensurePersonalCase`, which is what makes "no client-supplied
      // string reaches cases.display_name/email" true by construction rather
      // than by a test that can only check the shapes it imagined.
      expect.objectContaining({
        assessmentId: ASSESSMENT_UUID,
        user: expect.objectContaining({ id: "user-1", email: "aarav@example.com" }),
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
    expect(emailArgs.user.id).toBe(googleArgs.user.id);
    expect(emailArgs.user.email).toBe(googleArgs.user.email);
    // The email session carries no provider display name — and that is now a
    // fact about the SESSION, not about a parameter one provider fills in. The
    // derivation reads the User object, so there is no provider fork to drift.
    expect(emailArgs.user.user_metadata?.full_name).toBeUndefined();
  });

  it("sends the user to /assess?error=expired when the row can no longer be claimed", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false });
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: validClaim() });
    expect(dest).toBe("/assess?error=expired");
  });

  // MV-130 / audit C-9: a failed claim is not one dead end. Each distinct cause routes
  // to its own honest recovery on /assess so the student is never silently dropped.
  it("treats a re-claim of the user's own assessment as success (lands on the assessment)", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "already-mine" });
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: validClaim() });
    expect(dest).toBe(`/assessment/${ASSESSMENT_UUID}`);
  });

  it("routes a purged/expired assessment to /assess?error=expired", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "expired" });
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: validClaim() });
    expect(dest).toBe("/assess?error=expired");
  });

  it("routes an assessment already bound to another account to /assess?error=claimed", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "claimed" });
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: validClaim() });
    expect(dest).toBe("/assess?error=claimed");
  });

  it("routes a transient claim write failure to the retryable /assess?error=claim-failed", async () => {
    claimAndBootstrapProfile.mockResolvedValue({ claimed: false, reason: "error" });
    const dest = await resolveSignInDestination({ id: "user-1" }, { claim: validClaim() });
    expect(dest).toBe("/assess?error=claim-failed");
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
