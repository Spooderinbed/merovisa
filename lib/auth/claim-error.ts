/**
 * The `?error=` codes the sign-in seam can leave on `/assess` when a claim fails
 * partway (audit C-9 / MV-130). One shared source so the producer
 * (`resolveSignInDestination`) and the consumer (the `/assess` recovery surface)
 * can never drift — an unrecognised code renders nothing, so a typo would silently
 * re-open the dead end this card closes.
 *
 * - `auth`: the OAuth/email code exchange itself failed — no session was created.
 * - `invalid-claim`: the carried claim token was missing, tampered, or past its TTL.
 * - `expired`: the assessment was purged, deleted, or past its 3-day life.
 * - `claimed`: the assessment is already bound to another account.
 * - `claim-failed`: a transient failure while linking — the assessment is still there.
 *
 * Framework-neutral (no `server-only`): imported by both the server page and the
 * client recovery component.
 */
export const CLAIM_ERROR_CODES = [
  "auth",
  "invalid-claim",
  "expired",
  "claimed",
  "claim-failed",
] as const;

export type ClaimErrorCode = (typeof CLAIM_ERROR_CODES)[number];

export function isClaimErrorCode(value: string | null | undefined): value is ClaimErrorCode {
  return typeof value === "string" && (CLAIM_ERROR_CODES as readonly string[]).includes(value);
}
