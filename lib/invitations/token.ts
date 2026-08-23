import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * MV-193 — the invitation credential itself (Stage 5 slice 1).
 *
 * `public.invitations.token_hash` is `not null unique`, and MV-150's own comment on
 * it states the contract this module implements: *"The raw token is NEVER stored: the
 * app hashes it and stores only token_hash, so a database read cannot yield a usable
 * credential."*
 *
 * Everything here exists to keep one property true: **a reader of the database cannot
 * mint a working link.** Not a compromised backup, not an over-broad service-role
 * query, not a future audit export. The plaintext exists for exactly one round trip —
 * it is generated here, hashed here, and handed to the caller once — and is never
 * written anywhere the product can read it back.
 *
 * `tests/invitations/token-secrecy.test.ts` is the test that hunts a violation, and it
 * was written before this file.
 */

/**
 * 32 bytes = 256 bits of `randomBytes` entropy, base64url-encoded to 43 characters.
 *
 * The number is chosen against the threat, which is **online guessing against a
 * `unique` index**, not offline cracking: an attacker who could brute-force this could
 * mint invitations for cases they have never seen. At 256 bits that search is not
 * merely expensive, it is arithmetically closed — and because the token is generated
 * rather than chosen by a human, there is no dictionary to shortcut it.
 *
 * base64url, not hex, and not plain base64: the token rides in a link the counsellor
 * pastes into a chat message, so it must survive a URL path segment with no escaping
 * (base64's `+` and `/` do not) and no line wrapping.
 */
export const INVITATION_TOKEN_BYTES = 32;

/**
 * How long a minted invitation stays usable. **Seven days**, and the reasoning is
 * spelled out because criterion 5 refuses a magic number.
 *
 * The product already has a 3-day expiry — the anonymous assessment — and it is
 * deliberately NOT reused here, because the two clocks are doing opposite jobs. The
 * assessment's 3 days are an *urgency driver*: the shortness is the feature, and the
 * person it presses is the person who benefits from acting.
 *
 * An invitation's expiry is a *blast-radius bound*, and the person it presses is the
 * wrong one. The counsellor sends this link out of band — Viber, WhatsApp, their own
 * email client (see the card's "a copyable link, not an email") — to a student who may
 * be mid-semester, offline, or waiting on a parent. When it expires, the student is
 * stuck and the *counsellor* must notice, re-mint and re-send. So a short TTL buys a
 * little security and spends it in support load on the paying side.
 *
 * Seven days is the shortest window that spans both a weekend and a working week, so
 * a link sent on a Friday is still good when the student sits down on the following
 * Thursday. Longer — 30 days, the reflexive default — would leave a live credential
 * in a chat history for a month after the case moved on.
 *
 * Slice 2 is what *enforces* this: expiry is one of the four words in the Stage 5 exit
 * gate (replay, mismatch, expiry, revocation). This slice's obligation is only to make
 * the state representable and truthful.
 */
export const INVITATION_TTL_DAYS = 7;

export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** A freshly minted credential: the half that is sent, and the half that is stored. */
export interface MintedInvitationToken {
  /** Returned to the counsellor exactly once and never persisted. */
  token: string;
  /** The only half that reaches `public.invitations`. */
  tokenHash: string;
}

/**
 * SHA-256, and deliberately **not** a password KDF (bcrypt/argon2/scrypt).
 *
 * A KDF's cost factor buys resistance to offline guessing of a *low-entropy* secret —
 * a human-chosen password. This token has 256 bits of `randomBytes` entropy, so there
 * is nothing to guess and a work factor would only slow the acceptance path down.
 *
 * No pepper either. A keyed HMAC would add a production secret whose rotation silently
 * invalidates every outstanding invitation, and it defends against a threat this design
 * has already closed: the attacker who holds the digest still cannot invert it, and
 * cannot enumerate a 256-bit preimage space with it.
 *
 * Hex rather than base64: `token_hash` is `text unique`, and a hex digest is
 * case-stable and has exactly one spelling, so two hashes of the same token can never
 * miss each other on the index.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A new token and its digest. The ONLY place a plaintext invitation token comes from.
 *
 * It returns both halves together rather than exposing a `generate` and letting each
 * caller hash: a caller that forgot the second step would write the plaintext into
 * `token_hash`, which is the exact defect this module exists to make unwritable.
 */
export function mintInvitationToken(): MintedInvitationToken {
  const token = randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

/**
 * When a token minted at `now` stops working, as the ISO instant the `timestamptz`
 * column wants.
 *
 * `now` is a parameter with a default rather than a bare `Date.now()` so a test can
 * pin the clock; nothing in the product passes it.
 */
export function invitationExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
}

/**
 * The link the counsellor copies.
 *
 * `/invite/<token>` is **slice 2's route** and does not exist yet — this slice only
 * mints the address it will answer on. Naming it here rather than in the component
 * keeps the one spelling in the one place both slices read.
 *
 * The token is in a PATH segment, which is the student's side of the wire and slice
 * 2's problem to scope. It must never appear in a counsellor-side URL, and it does
 * not: the mint hands it back in a POST response body.
 */
export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}
