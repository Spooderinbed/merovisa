/**
 * MV-194 — what the student is told, per outcome (Stage 5 slice 2).
 *
 * ## Why the copy is a module and not a string in a component
 *
 * Criterion 4 asks for four refusals that are **distinguishable** and honest, and criterion
 * 6 plus the founder decision at the top of the card add an honesty obligation with teeth:
 * a returning student who already used the self-serve product will land in an EMPTY
 * consultancy case, and **nothing here may imply their existing data came with them, and
 * nothing may imply it was lost.** Both are testable claims about text, and text asserted in
 * a component is text a later author edits without meeting the test.
 *
 * `tests/invitations/accept-copy.test.ts` reads this file.
 *
 * No `server-only`: the accept panel is a client component and renders these strings, and a
 * refusal reason carries no rule that must be hidden from client JS. The reasons themselves
 * are already on the wire — that is what makes them distinguishable.
 *
 * ## Why the OUTCOME VOCABULARY lives here rather than beside the logic
 *
 * It was originally declared in `./accept.ts` and imported here as a type. That module is
 * `import "server-only"`, and `tests/architecture/client-server-boundary.test.ts` refused the
 * edge — correctly. It walks the import GRAPH rather than trusting `import type` to be
 * erased, because "this one is only a type" is a distinction one careless edit destroys, and
 * the failure it prevents is a server module ending up in a client bundle.
 *
 * So the direction is inverted: the names are declared in this client-safe module and
 * `accept.ts` imports them. The vocabulary and the sentence each name maps to are the same
 * decision anyway (criterion 4), so keeping them in one file is not merely a workaround.
 *
 * ## And what none of them say
 *
 * No message names the case, the consultancy, the invited address, or the token. A student
 * holding a token that was not meant for them learns only that it was not meant for them.
 */

/**
 * Why a redemption did not happen. Each is a DIFFERENT sentence to the student, because a
 * single "this link doesn't work" makes the exit gate untestable from the outside and leaves
 * a student with no idea whether to wait, re-read their address, or ask for a new link.
 */
export const INVITATION_REDEEM_FAILURES = [
  /** A blank token, actor or address. A caller bug or a probe; neither earns a query. */
  "invalid-input",
  /** No STUDENT invitation carries this digest. Also covers a team token. */
  "invalid-token",
  /** Decision A — the invitation names a different address from the signed-in account. */
  "email-mismatch",
  /** Replay: already spent, and the case it bought belongs to somebody else. */
  "already-accepted",
  "revoked",
  "expired",
  /** A read or write could not complete. NEVER reported as one of the refusals above. */
  "redeem-failed",
] as const;
export type InvitationRedeemFailure = (typeof INVITATION_REDEEM_FAILURES)[number];

export type CaseLinkFailure =
  /** Decision D — the case already holds a DIFFERENT student. Refused, never overwritten. */
  | "case-already-linked"
  | "link-failed";

/** An account with no email address at all — checked at the route, before any redemption. */
export type AcceptRouteFailure = InvitationRedeemFailure | CaseLinkFailure | "no-account-email";

export const ACCEPT_FAILURE_MESSAGES: Record<AcceptRouteFailure, string> = {
  "invalid-token":
    "This invitation link isn't valid. Ask your consultancy to send you a new one.",
  // Names the mismatch and neither of the addresses. The student knows their own; telling
  // them the other one would hand any token holder the invited student's address.
  "email-mismatch":
    "This invitation was sent to a different email address. Sign in with the address your consultancy invited, or ask them to send a new link to this one.",
  "already-accepted":
    "This invitation has already been used. If that wasn't you, tell your consultancy.",
  revoked: "Your consultancy withdrew this invitation. Ask them for a new link.",
  expired: "This invitation has expired. Ask your consultancy to send you a new one.",
  "invalid-input": "We couldn't read that invitation link. Check you copied all of it.",
  "redeem-failed": "Something went wrong at our end. Try again in a minute.",
  "no-account-email":
    "This account has no email address, so we can't check the invitation against it.",
  // THE TWO HALF-DONE STATES. Both say plainly that the link is spent, because it is — the
  // compare-and-swap committed and the student's next click will be refused as a replay.
  // Saying "try again" here would send them into that refusal and make us look broken twice.
  "case-already-linked":
    "Your invitation was accepted, but this case is already connected to another student. Your link has been used, so tell your consultancy — they'll need to sort this out before you can continue.",
  "link-failed":
    "Your invitation was accepted, but we couldn't finish connecting you to the case. Your link has been used, so tell your consultancy rather than trying it again.",
};

/**
 * The confirmation, and the whole reason this file has a test.
 *
 * The founder decision of 2026-08-24 is that **the two cases stay separate**: a student who
 * used the self-serve product keeps their personal case, and accepting a consultancy
 * invitation links them to a SECOND one. Their profile and their documents do not follow
 * them across the boundary.
 *
 * That makes an empty consultancy case an accepted outcome rather than a bug — and makes
 * these three sentences the place the product is honest about it. The first states what
 * happened. The second says where the student's own work stayed, without implying it was
 * lost. The third says what the consultancy will now ask for, so an empty case reads as a
 * starting point rather than as a failure.
 *
 * What it must never say: that anything was brought over, transferred, imported, synced or
 * merged. A helpful "we've brought your profile across" is now a DEFECT (card, Scope — out).
 */
export const ACCEPT_CONFIRMATION = {
  heading: "You're connected to your consultancy",
  body: "Your counsellor can now work on your case with you.",
  separateCases:
    "Your own MeroVisa answers and documents stay in your own account — they aren't copied into the consultancy's case, and nothing has been taken away from you. Your counsellor will ask for what they need on their side.",
  /**
   * Where the student goes next — rewritten by MV-195, which is the slice that earned it.
   *
   * MV-194 wrote this deliberately weak ("Your dashboard still shows your own MeroVisa work,
   * and that's where to find it") because at the time the accepted case was UNREACHABLE:
   * every consultancy-case route sat under `/workspace/[organizationId]`, whose layout gates
   * on active memberships, and `student` is not one. Naming a second place would have been a
   * lie the student discovered one click later.
   *
   * Slice 3 built that place, so the hedge became the lie instead — a student told only about
   * their dashboard would never find the case they had just accepted. The sentence now names
   * both, and keeps them apart in the same breath: two places, one of them theirs, neither
   * standing in for the other.
   */
  dashboardNote:
    "You'll find their case under Your consultancy, and your dashboard keeps showing your own MeroVisa work.",
  /** Decision C — a second click by the same student. Nothing changed, and it says so. */
  alreadyLinked: "You'd already accepted this invitation. You're still connected.",
} as const;

/**
 * What a signed-in student is told BEFORE they accept.
 *
 * It claims nothing about the invitation, because nothing has been checked yet: the token is
 * only examined when they press the button. "You've opened an invitation link" is a fact
 * about the URL; "you have been invited" would be an assertion the page has not earned.
 */
export const ACCEPT_PROMPT = {
  heading: "Accept your invitation",
  body: "You've opened an invitation link. Accepting connects this account to your consultancy's case, so your counsellor can work on it with you.",
  action: "Accept invitation",
} as const;

/**
 * The unauthenticated view — decision B, erring toward showing less.
 *
 * The card permits saying that an invitation exists and which consultancy sent it "only if
 * you can argue that is not itself a disclosure". No such argument was found worth making:
 * the student already knows who invited them, because that person sent them the link, so
 * naming the consultancy back to them buys nothing and hands a token holder who should not
 * have one a fact they did not arrive with.
 *
 * So this says nothing about the invitation at all — not whether it exists, not who it
 * names, not what it is for. An earlier draft read "the address your consultancy invited",
 * and `tests/app/invite-page.test.tsx` refused it.
 */
export const ACCEPT_SIGN_IN_PROMPT = {
  heading: "Sign in to continue",
  body: "Sign in with the email address this link was sent to, and we'll take it from there.",
} as const;
