import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { hashInvitationToken } from "./token";
import { normalizeInvitationEmail, STUDENT_INVITATION_ROLE } from "@/lib/cases/invitations-repo";
// The outcome vocabulary is declared in the CLIENT-SAFE module and imported here, not the
// other way round: this file is `server-only`, and `tests/architecture/client-server-boundary`
// walks the import graph rather than trusting `import type` to be erased. See that module's
// header for why the inversion is right rather than merely convenient.
import type { CaseLinkFailure, InvitationRedeemFailure } from "./accept-messages";

/**
 * MV-194 — redeeming a student invitation (Stage 5 slice 2).
 *
 * ## This is the compare-and-swap MV-150 promised three stages ago
 *
 * The mechanism is not invented here. It is written in the schema's own comment on
 * `invitations.token_hash`, verbatim:
 *
 *   > `unique (token_hash)` is what makes the atomic compare-and-swap acceptance
 *   > enforceable — one statement setting `accepted_at` where the hash matches AND
 *   > `accepted_at is null` AND `revoked_at is null` AND `expires_at > now()`, with the
 *   > affected row count deciding success. That statement is Stage 5 app code; MV-150
 *   > ships only the columns and the uniqueness it needs.
 *
 * The Stage 5 exit gate's four words map one-to-one onto those four predicates —
 * **mismatch** onto the hash, **replay** onto `accepted_at is null`, **revocation** onto
 * `revoked_at is null`, **expiry** onto `expires_at > now()`. Losing any one predicate
 * loses exactly one gate word, which is what makes the gate mutation-testable rather than
 * merely asserted. `supabase/rehearsal/MV-194-mutation.sql` records the measured run.
 *
 * ## The swap runs FIRST, and nothing reads the row before it
 *
 * There is no pre-read that refuses on `accepted_at` / `revoked_at` / `expires_at`. A
 * pre-read would be the most natural thing to write and it would quietly kill the design:
 * three of the four predicates would become unreachable code, every mutant on them would
 * survive at full green, and the gate would read as enforced while being enforced nowhere.
 * The row IS read afterwards — but only to name a refusal the swap has already decided.
 *
 * The address check (decision A) rides in the SAME statement for the same reason, plus one
 * of its own: checked before the swap it would be a TOCTOU window; checked after, it would
 * arrive too late to stop the burn.
 *
 * ## Two writes, and why this module deliberately does NOT do both
 *
 * Acceptance is the swap **and** setting `cases.student_user_id`. PostgREST gives one
 * statement per request, so these cannot be one transaction without a database function,
 * and there is none (see the card's "atomicity gap", and the finding on the dossier).
 *
 * The card's position, followed here: **swap first.** The swap is the authorization
 * decision and must be the single atomic thing that decides a winner; the link is its
 * consequence. A burned token with an unlinked student costs a support round trip. Pointing
 * a consultancy's case at a person on a credential that turned out to be expired, revoked
 * or already spent is a security regression, and no amount of support recovers it.
 *
 * The two halves are exported SEPARATELY rather than wrapped in one `acceptInvitation`
 * precisely so the ordering is visible at the call site: the route runs the swap, writes
 * `invitation.accepted`, and only then links. That ordering is the reason a burned token is
 * a RECORDED state rather than an invisible one — see the route's header.
 *
 * ## Both writes are service-role, by design and not by accident
 *
 * `authenticated` holds `select, insert` and `update (revoked_at)` on `invitations` —
 * **`accepted_at` is in no grant.** On `cases` it holds `update (display_name, email,
 * operational_status, archived_at)` — **`student_user_id` is in no grant.** MV-150 states
 * why in the migration itself: linking a case to somebody else's Auth account "is invitation
 * acceptance (an atomic compare-and-swap, Stage 5), never a field a consultancy can point at
 * a stranger." So the client this module takes MUST be the service-role client; an
 * authenticated one would produce a plan-time `42501` on the first statement. The call site
 * that constructs it is registered in `lib/supabase/service-role-exceptions.ts`.
 *
 * ## The plaintext token stops here
 *
 * It arrives, it is hashed, and the digest is what reaches the database. It is never
 * written to a row, never returned, never logged, and never put in an audit payload —
 * `tests/invitations/token-secrecy.test.ts` is the suite that hunts a violation, and it was
 * extended before this file existed.
 */

/**
 * The service-role client, structurally. Narrowed to `from` so nothing here can reach
 * `.auth` — and typed rather than `any` so a column renamed in a later migration breaks
 * this file instead of silently matching nothing.
 *
 * NOT a suggestion that any client will do. Handed the authenticated client, every
 * statement below is refused at plan time by the grants quoted in the header. The
 * parameter exists so tests can inject an in-memory fake, never so a caller can substitute
 * a narrower one.
 */
export type ElevatedInvitationClient = Pick<SupabaseClient<Database>, "from">;

/** `audit_events.entity_type` for both invitation events. Reused, never re-coined. */
export const INVITATION_ACCEPT_ENTITY_TYPE = "invitation";

export type RedeemInvitationResult =
  /** The swap won. The caller owes an audit row before it links. */
  | {
      ok: true;
      outcome: "redeemed";
      invitationId: string;
      caseId: string;
      organizationId: string | null;
    }
  /**
   * Decision C — this student already spent this token and the case is already theirs.
   * Nothing was written, nothing is owed, and they are landed in the case rather than
   * shown an error for succeeding twice.
   */
  | { ok: true; outcome: "already-yours"; caseId: string }
  | { ok: false; reason: InvitationRedeemFailure };

export type CaseLinkResult = { ok: true } | { ok: false; reason: CaseLinkFailure };

export interface RedeemInvitationInput {
  /** The plaintext from the student's link. Hashed here; never stored, logged or returned. */
  token: string;
  /** The signed-in account, from the verified session — never a caller-supplied id. */
  actorUserId: string;
  /** That account's email, for decision A. */
  actorEmail: string;
  /**
   * A parameter with a default so a test can pin the clock, exactly as
   * `invitationExpiresAt` takes one. Nothing in the product passes it.
   *
   * The APP clock and not the database's, and that is deliberate rather than lazy:
   * `expires_at` was written by `invitationExpiresAt(now)` from this same clock, so
   * comparing against it keeps the two ends of one TTL self-consistent. A `now()` inside
   * the statement would compare an app-written instant against a database-read one.
   */
  now?: Date;
}

/** The columns the diagnosis read may ask for. `token_hash` is NOT among them (criterion 7). */
const DIAGNOSIS_COLUMNS = "id, case_id, organization_id, email, role, accepted_at, revoked_at, expires_at";

interface DiagnosisRow {
  id: string;
  case_id: string | null;
  organization_id: string | null;
  email: string;
  role: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

interface SwapRow {
  id: string;
  case_id: string | null;
  organization_id: string | null;
}

function isPresent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Redeem one student invitation, atomically.
 *
 * Returns `outcome: "redeemed"` for exactly one caller per token, whatever the concurrency
 * — the affected row count of a single UPDATE against a `unique` index is the winner, and
 * `tests/integration/stage5-invitations.itest.ts` races it to prove it.
 */
export async function redeemInvitationToken(
  db: ElevatedInvitationClient,
  input: RedeemInvitationInput,
): Promise<RedeemInvitationResult> {
  const now = input.now ?? new Date();
  const address = normalizeInvitationEmail(input.actorEmail ?? "");
  if (!isPresent(input.token) || !isPresent(input.actorUserId) || address === null) {
    return { ok: false, reason: "invalid-input" };
  }

  const tokenHash = hashInvitationToken(input.token);
  const stamp = now.toISOString();

  try {
    // ===================================================================================
    // THE COMPARE-AND-SWAP. One statement. Six predicates, and every one of them matters:
    //
    //   token_hash  — MISMATCH. The credential itself, as a digest.
    //   role        — a TEAM invitation is a different authority and a different blast
    //                 radius (card, Scope — out). Not one of the gate's four words; a
    //                 scope guard, so the student path cannot redeem a counsellor's token.
    //   email       — decision A. In the statement so a wrong address cannot be raced past
    //                 it, and so a counsellor's typo does not BURN the token.
    //   accepted_at — REPLAY.
    //   revoked_at  — REVOCATION.
    //   expires_at  — EXPIRY.
    //
    // `accepted_at` is the ONLY column in the patch. Naming any other would be a claim
    // this statement has no authority to make.
    // ===================================================================================
    const swap = await db
      .from("invitations")
      .update({ accepted_at: stamp })
      .eq("token_hash", tokenHash)
      .eq("role", STUDENT_INVITATION_ROLE)
      .eq("email", address)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", stamp)
      // Ids only. A read path that projected `token_hash` would hand the digest back to
      // the very layer whose whole job is to stop holding it.
      .select("id, case_id, organization_id");

    // A PostgREST error RESOLVES rather than rejects (MISTAKES.md), so `error` is
    // destructured and checked. An outage reported as "your link is invalid" sends the
    // student to their counsellor for a new link that will fail in exactly the same way.
    if (swap.error) return { ok: false, reason: "redeem-failed" };

    const won = (swap.data ?? []) as unknown as SwapRow[];
    if (won.length === 1) {
      const row = won[0]!;
      // `invitations_shape_check` guarantees `case_id is not null` when `role = 'student'`,
      // so this cannot fire — but a redemption that could not name its case must not be
      // reported as a win, because the caller would then link nothing and audit a success.
      if (!isPresent(row.case_id)) return { ok: false, reason: "redeem-failed" };
      return {
        ok: true,
        outcome: "redeemed",
        invitationId: row.id,
        caseId: row.case_id,
        organizationId: row.organization_id,
      };
    }
    // More than one row means `unique (token_hash)` is gone, which is the one thing this
    // whole design rests on. Refuse rather than pick a winner.
    if (won.length > 1) return { ok: false, reason: "redeem-failed" };

    return await diagnose(db, { tokenHash, address, actorUserId: input.actorUserId, now });
  } catch {
    // A thrown client, an aborted request, or a client that does not expose `from`.
    return { ok: false, reason: "redeem-failed" };
  }
}

/**
 * Why the swap matched nothing — a READ, and only a read.
 *
 * It runs strictly after the decision and can change nothing about it. Its whole job is to
 * turn "zero rows affected" into a sentence the student can act on, and its precedence is
 * chosen for that: the address first because it is a fact about the READER rather than
 * about the invitation (and the one a counsellor can fix by re-sending), then the three
 * invitation states in the order `deriveInvitationState` already ranks them, so "what
 * happened to this invitation" means one thing in this codebase.
 */
async function diagnose(
  db: ElevatedInvitationClient,
  args: { tokenHash: string; address: string; actorUserId: string; now: Date },
): Promise<RedeemInvitationResult> {
  const { data, error } = await db
    .from("invitations")
    .select(DIAGNOSIS_COLUMNS)
    .eq("token_hash", args.tokenHash)
    .maybeSingle();

  if (error) return { ok: false, reason: "redeem-failed" };
  const row = data as unknown as DiagnosisRow | null;

  // No row, or a token that belongs to a team invitation. Both are "this is not a student
  // invitation link", and neither confirms anything to a holder who should not have one.
  if (!row || row.role !== STUDENT_INVITATION_ROLE) return { ok: false, reason: "invalid-token" };
  if (row.email !== args.address) return { ok: false, reason: "email-mismatch" };
  if (row.revoked_at !== null) return { ok: false, reason: "revoked" };

  if (row.accepted_at !== null) {
    // DECISION C, and it lives HERE — downstream of the swap — on purpose. Asked before
    // the swap, "is this already yours?" would stop the already-accepted state from ever
    // reaching the `accepted_at is null` predicate, and the replay defence would become
    // untestable from outside while looking exactly the same in the source.
    if (!isPresent(row.case_id)) return { ok: false, reason: "already-accepted" };
    const linked = await db
      .from("cases")
      .select("student_user_id")
      .eq("id", row.case_id)
      .maybeSingle();
    if (linked.error) return { ok: false, reason: "redeem-failed" };
    if (linked.data?.student_user_id === args.actorUserId) {
      return { ok: true, outcome: "already-yours", caseId: row.case_id };
    }
    return { ok: false, reason: "already-accepted" };
  }

  const expiry = new Date(row.expires_at).getTime();
  // An unparseable expiry reads as EXPIRED, never as usable — the same reading
  // `deriveInvitationState` takes, and for the same reason.
  if (Number.isNaN(expiry) || expiry <= args.now.getTime()) return { ok: false, reason: "expired" };

  // Every predicate holds and the swap still matched nothing. Unreachable in practice: a
  // concurrent winner would have left `accepted_at` set above. Reported as a failure rather
  // than as a refusal, because we do not know which refusal it would be.
  return { ok: false, reason: "redeem-failed" };
}

/**
 * Point one case at one student — the second write, and the consequence of the swap.
 *
 * DECISION D IS THE `is null` PREDICATE, not a check around it. A read-then-write would
 * leave a window in which a stale token evicts a linked student, and eviction is not
 * recoverable: the previous `student_user_id` is gone and nothing in the product records
 * what it was. The predicate makes the overwrite unexpressible.
 *
 * Zero rows affected is therefore ambiguous — the case may be held by somebody else, or
 * already by this same student (a counsellor invites a student who is already linked, and
 * the outcome they wanted is already true). One re-read separates them, because reporting
 * "somebody else has this case" for "you already have it" is a claim that is simply false.
 */
export async function linkCaseToStudent(
  db: ElevatedInvitationClient,
  caseId: string,
  studentUserId: string,
): Promise<CaseLinkResult> {
  if (!isPresent(caseId) || !isPresent(studentUserId)) return { ok: false, reason: "link-failed" };

  try {
    const { data, error } = await db
      .from("cases")
      .update({ student_user_id: studentUserId })
      .eq("id", caseId)
      .is("student_user_id", null)
      .select("id");

    if (error) return { ok: false, reason: "link-failed" };
    if ((data ?? []).length > 0) return { ok: true };

    const current = await db
      .from("cases")
      .select("student_user_id")
      .eq("id", caseId)
      .maybeSingle();
    if (current.error || !current.data) return { ok: false, reason: "link-failed" };
    if (current.data.student_user_id === studentUserId) return { ok: true };
    return { ok: false, reason: "case-already-linked" };
  } catch {
    return { ok: false, reason: "link-failed" };
  }
}
