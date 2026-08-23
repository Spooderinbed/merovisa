import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invitationExpiresAt, mintInvitationToken } from "@/lib/invitations/token";
import type { CaseAuthorizationClient } from "./context";
import type { CaseWriteFailure } from "./write-repo";

/**
 * MV-193 — student invitations, the data layer (Stage 5 slice 1).
 *
 * A counsellor mints a single-use invitation for a case and can revoke it. The table
 * is `public.invitations`, shipped complete by MV-150 and given policies by MV-152;
 * **this slice adds no migration and widens no grant** (card, criterion 8).
 *
 * ## The grant set is the design, and it shapes every function here
 *
 * `authenticated` holds `select, insert` on `invitations` and `update (revoked_at)` —
 * *that column alone*. Two consequences are load-bearing:
 *
 *  * **`accepted_at` is unwritable from any client, on any code path.** That is what
 *    keeps acceptance a server-side compare-and-swap for slice 2 rather than something
 *    a client can claim. Nothing here names it in a payload.
 *  * **`revoked_at` is the only column `revokeCaseInvitation` may write.** Naming any
 *    other — even `updated_at`, which a trigger stamps — makes the statement a
 *    plan-time `42501`.
 *
 * ## No upsert, ever
 *
 * supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE SET` naming every
 * payload column, so a column-scoped grant fails with `42501` at plan time even when
 * the row does not exist (MISTAKES.md, Supabase/Postgres; MV-168 converted three call
 * sites for exactly this). The mint below is a plain INSERT.
 *
 * ## The two PostgREST rules, the same two `document-requests-repo.ts` states
 *
 *  1. **A `42501` RESOLVES rather than rejects** — `throwOnError` has zero hits
 *     repo-wide, so a call site that does not destructure `error` drops the write and
 *     reports success. Every write below destructures.
 *  2. **A policy refusal is not an error** — Postgres reports it as zero rows affected.
 *     So the UPDATE reads its rows back and treats an empty result as `denied`.
 *
 * ## The authenticated client, always
 *
 * Row Level Security evaluated as the signed-in user is the tenant boundary; this
 * module is data access behind an already-authorized decision (`lib/cases/README.md`).
 * It never imports `createSupabaseAdminClient`, and
 * `tests/supabase/service-role-exceptions.test.ts` asserts that `lib/cases/` reaches
 * for service-role nowhere. The optional client parameter exists so tests can inject a
 * fake, never so a caller can substitute a wider one.
 *
 * ## The collision this module is careful NOT to decide
 *
 * A student who used the self-serve product already has a **personal case**
 * (`organization_id is null`, `student_user_id = them`). Inviting that same human to a
 * consultancy case would, on acceptance, link them to a second case. Which case they
 * see, and whether their profile follows them, is an open product decision — so
 * **nothing here assumes one case per human**: the mint does not look the email up
 * against `auth.users`, does not refuse a known address, and does not merge anything.
 * See the card, "The collision to NAME but not solve".
 */

/**
 * The only role this module ever writes. `invitations.role` is a WIDER set than
 * `organization_memberships.role` — it includes `'student'`, which memberships
 * deliberately exclude (MV-152's §7 header calls this out as the schema trap). Team
 * invitations (`owner|admin|counsellor`) are a different authority and a different
 * blast radius, and are explicitly out of this slice.
 */
export const STUDENT_INVITATION_ROLE = "student";

/**
 * PostgREST's `max_rows` (supabase/config.toml). A case's invitation list is tiny in
 * practice, but "tiny in practice" is not a bound — and a SILENTLY truncated list here
 * would hide an outstanding invitation, which is the one fact this list exists to
 * report. Same rule, same number, as `document-requests-repo.ts`.
 */
export const INVITATION_ROW_CEILING = 1000;

/**
 * The columns any read path may ask for. **`token_hash` is not among them, and that is
 * the point of the slice** — a list endpoint that projected it would hand a digest to
 * every counsellor's browser for no purpose at all. `accepted_at` IS read: slice 2
 * writes it, and a counsellor needs to see that an invitation was taken up.
 *
 * Stated once, as a constant, so the three read sites cannot drift apart — and so the
 * secrecy test can assert on the projection rather than on the mapping.
 */
const INVITATION_COLUMNS = "id, email, expires_at, accepted_at, revoked_at, created_at";

/**
 * What has actually become of one invitation.
 *
 * Derived, never stored — the table has no status column, and adding one would be a
 * migration. The order below is the precedence, and it is not arbitrary: an accepted
 * invitation stays accepted even after its expiry passes, and a revoked one stays
 * revoked even if it was accepted first (which slice 2's compare-and-swap makes
 * impossible, but this function must not depend on that to be truthful).
 */
export const INVITATION_STATES = ["revoked", "accepted", "expired", "outstanding"] as const;
export type InvitationState = (typeof INVITATION_STATES)[number];

/** One invitation, as the case surface renders it. Carries no token and no digest. */
export interface CaseInvitation {
  id: string;
  email: string;
  state: InvitationState;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type InvitationListResult =
  | { ok: true; data: CaseInvitation[] }
  | { ok: false; reason: "lookup-failed" };

export type InvitationMintFailure =
  | CaseWriteFailure
  | "unknown-case"
  | "not-an-org-case"
  | "already-outstanding";

export type InvitationMintResult =
  /**
   * `token` is the plaintext, returned **exactly once** and never persisted
   * (criterion 4). Every read path above returns the invitation without it.
   */
  | { ok: true; id: string; token: string; expiresAt: string }
  | { ok: false; reason: InvitationMintFailure };

export type InvitationRevokeResult = { ok: true } | { ok: false; reason: CaseWriteFailure };

interface InvitationRow {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A PostgREST code, mapped the same way `./write-repo.ts:160` maps it. */
function writeFailure(code: string | undefined): CaseWriteFailure {
  return code === "42501" ? "denied" : "write-failed";
}

async function client(db?: CaseAuthorizationClient): Promise<CaseAuthorizationClient> {
  return db ?? (await createSupabaseServerClient());
}

/**
 * The email guard between a caller and the `text not null` column.
 *
 * Deliberately loose. A route validates the shape with Zod; this exists so a blank or
 * whitespace-only value cannot become a row, and so the stored form is trimmed and
 * lower-cased ONCE, here, rather than differently at each call site.
 *
 * Lower-casing the stored value is a decision slice 2 depends on: acceptance matches
 * the invited address against the account that signed in, and `Ram@Example.com` and
 * `ram@example.com` are the same mailbox everywhere this product operates. MV-150's
 * comment says "email is stored as given; normalized-address matching at acceptance
 * time is Stage 5" — this IS Stage 5, and normalising at the single write path is
 * strictly better than normalising at every future read of it.
 */
export function normalizeInvitationEmail(email: string): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (trimmed === "") return null;
  return trimmed;
}

/** Derive the four states from the three timestamps. Pure; exported for its own test. */
export function deriveInvitationState(
  row: { expires_at: string; accepted_at: string | null; revoked_at: string | null },
  now: Date = new Date(),
): InvitationState {
  if (row.revoked_at !== null) return "revoked";
  if (row.accepted_at !== null) return "accepted";
  const expiry = new Date(row.expires_at).getTime();
  // An unparseable expiry is treated as EXPIRED, never as outstanding. A column the
  // database guarantees `not null timestamptz` cannot reach here malformed — but if it
  // ever did, calling a credential of unknown lifetime "outstanding" is the one
  // reading that keeps a link alive on a guess.
  if (Number.isNaN(expiry) || expiry <= now.getTime()) return "expired";
  return "outstanding";
}

function toInvitation(row: InvitationRow, now?: Date): CaseInvitation {
  return {
    id: row.id,
    email: row.email,
    state: deriveInvitationState(row, now),
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * One case's invitations, newest first.
 *
 * EVERY invitation, not just the outstanding one, and the state is derived rather than
 * filtered at the database. A counsellor looking at a case needs to tell "nobody has
 * ever been invited" from "an invitation was sent and revoked" from "one expired
 * unnoticed" — three different next actions, which a query filtered down to
 * `outstanding` collapses into one empty list.
 */
export async function listCaseInvitations(
  caseId: string,
  db?: CaseAuthorizationClient,
  now?: Date,
): Promise<InvitationListResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("invitations")
      .select(INVITATION_COLUMNS)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    // A read that could not complete is an OUTAGE, never an empty list. The two render
    // as "we could not find out" and "nobody has been invited", and only one of them is
    // true — telling a counsellor no invitation is outstanding when one may be is how a
    // second link gets minted for a student who already has one.
    if (error) return { ok: false, reason: "lookup-failed" };
    const rows = (data ?? []) as unknown as InvitationRow[];
    // At the ceiling the answer MAY be a prefix, and PostgREST does not say so.
    if (rows.length >= INVITATION_ROW_CEILING) return { ok: false, reason: "lookup-failed" };

    return { ok: true, data: rows.map((row) => toInvitation(row, now)) };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * Mint one student invitation for a case, and return its plaintext token once.
 *
 * Authorization is the CALLER's — `requireCasePermission(actor, caseId,
 * "case.invite_student")`. This function does not re-decide it; it is the data access
 * behind an already-authorized decision, and `invitations_insert_staff`'s student
 * branch (`case_id is not null and role = 'student' and private.can_staff_case(case_id)
 * and organization_id is not distinct from private.case_org_id(case_id)`) is the layer
 * that cannot be talked out of it.
 *
 * ## Criterion 7 — a second invitation is REFUSED, not silently minted
 *
 * The card offers two answers and requires one to be picked and stated. **This slice
 * refuses**, and the reason is that the alternative is not available: "revoke the
 * previous one in the same transaction" needs a transaction, PostgREST gives one
 * statement per request, and the only way to get both writes under one commit is a
 * database function — i.e. a migration, which criterion 8 forbids. Doing it as two
 * requests is strictly worse than refusing: a revoke that succeeds followed by a mint
 * that fails leaves the case with NO usable invitation and a counsellor who believes
 * they just sent one.
 *
 * So the answer is `already-outstanding`, and the counsellor revokes and re-mints —
 * two deliberate acts, with the revoke audited, which is also the more honest record of
 * what happened to the first link.
 *
 * ## Why the organization is READ rather than accepted
 *
 * The INSERT policy pins `organization_id` to `private.case_org_id(case_id)`, so a
 * caller-supplied value could only ever agree or be refused. Resolving it here makes
 * the column right by construction instead of turning a caller's bug into a `42501`
 * the user reads as "you may not do this" — and it separates two genuinely different
 * refusals: a case that does not exist, and a PERSONAL case, which has no organization
 * and cannot carry a consultancy invitation at all.
 *
 * The read is issued on the SAME authenticated client, so it is RLS-scoped: a case the
 * actor cannot see resolves to `unknown-case`, which is honest and is not an existence
 * oracle.
 */
export async function createStudentInvitation(
  actorUserId: string,
  caseId: string,
  email: string,
  db?: CaseAuthorizationClient,
  now: Date = new Date(),
): Promise<InvitationMintResult> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(caseId)) return { ok: false, reason: "invalid-input" };

  const address = normalizeInvitationEmail(email);
  if (address === null) return { ok: false, reason: "invalid-input" };

  try {
    const supabase = await client(db);

    const caseRow = await supabase
      .from("cases")
      .select("organization_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseRow.error) return { ok: false, reason: "write-failed" };
    if (!caseRow.data) return { ok: false, reason: "unknown-case" };
    const organizationId = caseRow.data.organization_id;
    // A personal case has no organization, and `invitations_shape_check` would admit
    // the row while `invitations_insert_staff`'s student branch refuses it. Naming the
    // refusal here is the difference between "this case cannot be shared with a
    // consultancy" and "you may not do this".
    if (organizationId === null) return { ok: false, reason: "not-an-org-case" };

    // Criterion 7. Read through the same authenticated client and the same derivation
    // the surface uses, so "outstanding" means one thing in this codebase.
    const existing = await listCaseInvitations(caseId, supabase, now);
    if (!existing.ok) return { ok: false, reason: "write-failed" };
    if (existing.data.some((invitation) => invitation.state === "outstanding")) {
      return { ok: false, reason: "already-outstanding" };
    }

    // The ONLY place a plaintext token exists. `tokenHash` goes to the database and
    // `token` goes back to the caller; neither ever swaps places.
    const { token, tokenHash } = mintInvitationToken();
    const expiresAt = invitationExpiresAt(now);

    const { data, error } = await supabase
      .from("invitations")
      .insert({
        case_id: caseId,
        organization_id: organizationId,
        email: address,
        role: STUDENT_INVITATION_ROLE,
        token_hash: tokenHash,
        expires_at: expiresAt,
        // Provenance, and criterion 2. `invited_by` references `auth.users`; the policy
        // does not pin it, so writing anything but the actor would be a lie this
        // function is the last place able to prevent.
        invited_by: actorUserId,
        // `accepted_at` and `revoked_at` are ABSENT on purpose. The first is outside
        // the grant entirely (naming it is a plan-time 42501); the second defaults to
        // null, and a fresh invitation that named it would be asserting a state it has
        // not got.
      })
      .select("id")
      .single();

    if (error) return { ok: false, reason: writeFailure(error.code) };
    if (!data) return { ok: false, reason: "write-failed" };
    return { ok: true, id: data.id, token, expiresAt };
  } catch {
    // A thrown client, an aborted request, or a client that does not expose `from`.
    // A write that could not complete is a failure, never a success.
    return { ok: false, reason: "write-failed" };
  }
}

/**
 * Revoke one invitation. The row SURVIVES — `revoked_at` is stamped, nothing is deleted
 * (criterion 6).
 *
 * That is a schema decision, not a preference: MV-152 shipped no DELETE policy on
 * `invitations` at all, with the reason stated in the migration — *"revocation is the
 * audited path, and a deleted invitation is a deleted record of who was invited."*
 *
 * `revoked_at` is the ONLY column in the payload because it is the only column in the
 * grant. `updated_at` is stamped by `invitations_set_updated_at`, a trigger, and naming
 * it here would make every revoke a plan-time `42501`.
 *
 * BOTH the id and the case are filters. The caller authorized `case.invite_student` for
 * ONE case; without the `case_id` predicate the invitation id alone would decide which
 * row moves, so an id belonging to a different case the actor happens to staff would be
 * revoked under this case's authorization. RLS still holds the tenant boundary — but
 * "the tenant boundary held" is not "the row the user was looking at is the row that
 * changed" (spec F-8's defect class, and the reason `resolveCaseDocumentRequest` filters
 * the same way).
 */
export async function revokeCaseInvitation(
  invitationId: string,
  caseId: string,
  db?: CaseAuthorizationClient,
  now: Date = new Date(),
): Promise<InvitationRevokeResult> {
  if (!isPresent(invitationId) || !isPresent(caseId)) return { ok: false, reason: "invalid-input" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("invitations")
      .update({ revoked_at: now.toISOString() })
      .eq("id", invitationId)
      .eq("case_id", caseId)
      .select("id");

    if (error) return { ok: false, reason: writeFailure(error.code) };
    // Zero rows is how `invitations_update_staff` refuses, and it is also how an
    // invitation belonging to another case fails the `case_id` filter. Both are a
    // denial and neither is a success.
    if (!data || data.length === 0) return { ok: false, reason: "denied" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}
