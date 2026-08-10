import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgMembership } from "@/lib/org/repo";
import type { CaseAuthorizationClient } from "./context";
import { isOperationalStatus } from "./operational-status";

/**
 * The write half of the consultancy workspace — access-matrix cells 8, 9 and 10
 * (spec §4): create a case, hand it to one primary counsellor, move its
 * `operational_status`.
 *
 * THE AUTHENTICATED CLIENT, ALWAYS. Row Level Security evaluated as the signed-in
 * user is the tenant boundary; this module is defense in depth on top of it
 * (`./README.md`). It never imports `createSupabaseAdminClient` — and
 * `tests/supabase/service-role-exceptions.test.ts` asserts that `lib/cases/`
 * reaches for service-role nowhere. The optional client parameter exists so tests
 * can inject a fake, never so a caller can substitute a wider one.
 *
 * NO SQL SHIPS WITH THIS MODULE, and spec §5 forbids a Stage 3 migration that
 * adds or alters a column. Everything below was already granted and policed by
 * MV-152 and is live in production:
 *
 * | Write | Grant | Policy / trigger |
 * |---|---|---|
 * | `cases` INSERT | table-level (`…20260730180000….sql:684`) | `cases_insert_admin` (`:412`) |
 * | `cases` UPDATE `operational_status` | column grant (`:691-692`) | `cases_update_accessor` (`:429`) **+ the trigger** |
 * | `case_assignments` INSERT | table-level (`:685`) | `case_assignments_insert_admin` (`:552`) |
 * | `case_assignments` DELETE | table-level (`:685`) | `case_assignments_delete_admin` (`:561`) |
 *
 * ## Two PostgREST rules every function here obeys
 *
 * 1. **A `42501` RESOLVES rather than rejects.** `grep -rn throwOnError lib/ app/`
 *    returns zero hits, so a call site that does not destructure `error` drops the
 *    write and reports success. Every write below destructures.
 * 2. **A policy refusal is not an error** — Postgres reports it as zero rows
 *    affected. So every UPDATE and DELETE reads its rows back and treats an empty
 *    result as `denied`; otherwise a refused write and a successful one are the
 *    same value.
 *
 * ## And one rule about the trigger
 *
 * `operational_status` is gated by `cases_write_surface_guard` →
 * `private.enforce_case_write_surface()` (`:473-514`), **not** by RLS.
 * `cases_update_accessor` admits the linked student; only the trigger stops them
 * writing this column. A reader reasoning from the policy alone gets the wrong
 * answer. The trigger is `BEFORE UPDATE`, so it never fires on INSERT — which is
 * why `createOrgCase` does not name the column at all.
 *
 * ## No upsert, anywhere
 *
 * supabase-js compiles `.upsert()` to `INSERT … ON CONFLICT DO UPDATE SET` naming
 * every payload column, so a column-scoped INSERT grant fails with `42501` at plan
 * time even when the row does not exist — and a partial unique index is not an
 * inferrable `ON CONFLICT` arbiter (`42P10`) besides. MV-168 converted three call
 * sites for exactly this reason.
 */

/**
 * The only value `case_assignments_assignment_role_check` admits
 * (`…20260730120000….sql:114`). It matters that this literal lives in one place:
 * `case_assignments_insert_admin` does **not** constrain the column, so the app is
 * what stands between a widened check constraint and a second assignment role
 * being written with no additional authority test.
 */
export const PRIMARY_COUNSELLOR_ROLE = "primary_counsellor" as const;

/**
 * Why a write did not happen. Each value maps to a distinct sentence a person can
 * act on — the same discipline `components/workspace/save-error.ts` states for the
 * HTTP layer. `denied` and `write-failed` must never collapse: one means "ask
 * someone", the other means "try again".
 */
export type CaseWriteFailure = "invalid-input" | "denied" | "write-failed";

export type CaseCreateResult =
  | { ok: true; caseId: string }
  | { ok: false; reason: CaseWriteFailure };

export type CaseStatusResult = { ok: true } | { ok: false; reason: CaseWriteFailure };

/**
 * One case, as the manage surface reads it.
 *
 * It carries `organizationId` — which `OrgCaseSummary` deliberately does not,
 * because the list already knows the organization it queried. A single-case page
 * does not: it takes the organization from the URL and the case from the URL, and
 * has to check that the two agree. Authorization is per case, so a mismatch is
 * not a leak; it is a case rendered under another organization's URL, with an
 * assignment picker full of members who cannot hold it.
 *
 * `student_user_id` is read and NOT carried, for the reason MV-170 states: a raw
 * Auth user id is no use to a counsellor and does not belong in markup. What the
 * surface needs from it is the boolean.
 */
export interface OrgCaseDetail {
  id: string;
  organizationId: string | null;
  displayName: string;
  email: string | null;
  operationalStatus: string;
  hasLinkedStudent: boolean;
  archivedAt: string | null;
}

export type CaseDetailResult =
  | { ok: true; data: OrgCaseDetail | null }
  | { ok: false; reason: "lookup-failed" };

export interface PrimaryCounsellor {
  /** The `case_assignments` row id — what a replacement deletes. */
  assignmentId: string;
  userId: string;
}

export type PrimaryCounsellorReadResult =
  | { ok: true; data: PrimaryCounsellor | null }
  | { ok: false; reason: "lookup-failed" };

export type AssignmentFailure =
  | CaseWriteFailure
  | "unknown-case"
  | "not-an-org-case"
  | "unknown-member"
  | "member-inactive"
  | "lookup-failed";

export type AssignmentResult =
  | { ok: true; changed: boolean }
  | {
      ok: false;
      reason: AssignmentFailure;
      /**
       * True only when the previous assignment was successfully deleted and the
       * replacement then failed — the one outcome where the case is left with no
       * primary counsellor. The unique index forces delete-then-insert, so this
       * window is real; naming it is the difference between telling an admin the
       * truth and telling them nothing happened.
       */
      leftUnassigned: boolean;
    };

function isPresent(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A PostgREST code, mapped the same way `lib/org/repo.ts:199` maps it. */
function writeFailure(code: string | undefined): CaseWriteFailure {
  return code === "42501" ? "denied" : "write-failed";
}

async function client(db?: CaseAuthorizationClient): Promise<CaseAuthorizationClient> {
  return db ?? (await createSupabaseServerClient());
}

/**
 * Cell 8 — create a case for a student who has no account.
 *
 * The row shape is spec §6.3's: `organization_id` set, **`student_user_id` NULL**.
 * The column is not named at all rather than named as null, because linking a
 * student is Stage 5's and `cases_insert_admin`'s third conjunct would refuse any
 * value but the creator's own anyway.
 *
 * Authorization is the CALLER's — `checkOrgPermission(actor, org, "case.create")`,
 * which is org-scoped. This function does not re-decide it; it is the data access
 * behind an already-authorized decision, and the database's `cases_insert_admin`
 * is the layer that cannot be talked out of it.
 */
export async function createOrgCase(
  actorUserId: string,
  organizationId: string,
  input: { displayName: string; email?: string | null },
  db?: CaseAuthorizationClient,
): Promise<CaseCreateResult> {
  // A blank identifier can only come from a bug or a probe; neither earns a query.
  if (!isPresent(actorUserId) || !isPresent(organizationId)) {
    return { ok: false, reason: "invalid-input" };
  }
  const displayName = (input.displayName ?? "").trim();
  if (displayName === "") return { ok: false, reason: "invalid-input" };

  // Blank is stored as NULL, never as "". `cases.email` is nullable and "no email
  // address on file" is a real state; an empty string would be a third value that
  // renders as an address the student does not have.
  const email = (input.email ?? "").trim();

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("cases")
      .insert({
        organization_id: organizationId,
        display_name: displayName,
        email: email === "" ? null : email,
        // Provenance, and the only column here the policy does not constrain.
        // Writing the actor's own id is the honest value; the grant is table-level
        // so nothing at the database layer would object to another.
        created_by: actorUserId,
      })
      .select("id")
      .single();

    if (error) return { ok: false, reason: writeFailure(error.code) };
    if (!data) return { ok: false, reason: "write-failed" };
    return { ok: true, caseId: data.id };
  } catch {
    // A thrown client, an aborted request, or a client that does not expose
    // `from`. A write that could not complete is a failure, never a success.
    return { ok: false, reason: "write-failed" };
  }
}

/**
 * Cell 10 — move a case through the five check-constrained statuses.
 *
 * Only `operational_status` is written. `cases` grants UPDATE on four columns and
 * the trigger guards only two of them, so a wider patch would be writing
 * `display_name` or `archived_at` with nothing in front of it — and archiving is
 * Stage 6's, not this slice's.
 */
export async function setCaseOperationalStatus(
  caseId: string,
  status: string,
  db?: CaseAuthorizationClient,
): Promise<CaseStatusResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "invalid-input" };
  // The guard between user input and the database. A value the check constraint
  // does not admit is refused here rather than sent as a write that can only
  // ever raise `23514`.
  if (!isOperationalStatus(status)) return { ok: false, reason: "invalid-input" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("cases")
      .update({ operational_status: status })
      .eq("id", caseId)
      .select("id");

    if (error) return { ok: false, reason: writeFailure(error.code) };
    // Zero rows is how `cases_update_accessor` refuses; the trigger refuses with
    // `42501` instead. Both are a denial, and neither is a success.
    if (!data || data.length === 0) return { ok: false, reason: "denied" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}

/**
 * One case, for the surface that manages it.
 *
 * Two reads live in this module rather than in `./list-repo.ts`, and the reason is
 * that they exist to serve the writes above: the manage page has to show what it
 * is about to change, and `assignPrimaryCounsellor` has to know what it is about
 * to replace. `listOrgCases` answers a different question — "which cases are in
 * scope" — and keeping it out of this file keeps that scoping in one place.
 */
export async function readOrgCase(
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<CaseDetailResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("cases")
      .select("id, organization_id, display_name, email, operational_status, student_user_id, archived_at")
      .eq("id", caseId)
      .maybeSingle();

    // A read that could not complete is a failure, never a missing case — those
    // two render as an outage and a 404 respectively, and must not be swapped.
    if (error) return { ok: false, reason: "lookup-failed" };
    if (!data) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        id: data.id,
        organizationId: data.organization_id,
        displayName: data.display_name,
        email: data.email,
        operationalStatus: data.operational_status,
        hasLinkedStudent: data.student_user_id !== null,
        archivedAt: data.archived_at,
      },
    };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * The one primary counsellor a case may hold, or null.
 *
 * Filtered by `assignment_role` as well as by case: the partial unique index is
 * keyed on that predicate, and reading by `case_id` alone would return whatever a
 * future second role writes there.
 */
export async function readPrimaryCounsellor(
  caseId: string,
  db?: CaseAuthorizationClient,
): Promise<PrimaryCounsellorReadResult> {
  if (!isPresent(caseId)) return { ok: false, reason: "lookup-failed" };

  try {
    const supabase = await client(db);
    const { data, error } = await supabase
      .from("case_assignments")
      .select("id, user_id")
      .eq("case_id", caseId)
      .eq("assignment_role", PRIMARY_COUNSELLOR_ROLE)
      .maybeSingle();

    // A read that FAILED is not an unassigned case. Rendering the two the same
    // would tell an admin to assign somebody who is already assigned.
    if (error) return { ok: false, reason: "lookup-failed" };
    if (!data) return { ok: true, data: null };
    return { ok: true, data: { assignmentId: data.id, userId: data.user_id } };
  } catch {
    return { ok: false, reason: "lookup-failed" };
  }
}

/**
 * Cell 9 — put one member into the case's single primary-counsellor slot.
 *
 * ## Why this is a replacement and not an addition
 *
 * `case_assignments_primary_idx` is `UNIQUE (case_id) WHERE assignment_role =
 * 'primary_counsellor'` and the check constraint admits that one literal, so a
 * case has **at most one** primary counsellor (spec §2.5). Stage 3 assignment is
 * therefore reassignment of one slot, not a multi-counsellor collaboration model.
 *
 * ## Why the order is delete-then-insert, and why that is not a workaround
 *
 * The unique index makes insert-first a `23505`. There is no UPDATE grant and no
 * UPDATE policy on `case_assignments` to reach for instead — the migration
 * withheld both deliberately (`…20260730180000….sql:559-560`) so that the index
 * stays the only arbiter.
 *
 * ## Why the assignee's membership is checked HERE, before the delete
 *
 * `case_assignments_insert_admin`'s `is_case_org_member(case_id, user_id)`
 * conjunct would refuse a non-member or an inactive member anyway — but only after
 * the previous assignment had already been deleted, leaving the case with nobody
 * on it. Checking first turns the predictable failure into a no-op. This is
 * strictly NARROWER than the policy and moves no cell — the same shape as MV-169's
 * self-mutation refusal (spec §11, 2026-08-08).
 *
 * What remains after that check is an infrastructure failure between the two
 * writes, and `leftUnassigned` is how the caller learns about it.
 *
 * ## Why the parameter is a membership id, not an Auth user id
 *
 * The picker that calls this cannot show names (spec F-9), so it identifies
 * members by their membership row. Resolving membership → user id on the server
 * keeps a raw Auth user id out of the markup, exactly as MV-170 kept
 * `student_user_id` out of the student list. `getOrgMembership` is scoped to the
 * organization as well as the row, so a membership from another tenant simply does
 * not resolve.
 */
export async function assignPrimaryCounsellor(
  caseId: string,
  membershipId: string,
  db?: CaseAuthorizationClient,
): Promise<AssignmentResult> {
  const refuse = (reason: AssignmentFailure): AssignmentResult => ({
    ok: false,
    reason,
    leftUnassigned: false,
  });

  if (!isPresent(caseId) || !isPresent(membershipId)) return refuse("invalid-input");

  let deletedExisting = false;
  try {
    const supabase = await client(db);

    // The case's organization is what scopes the membership lookup. Resolving the
    // membership without it would let the decision layer read a role from the
    // wrong organization before the database ever saw the write — the same
    // reasoning `getOrgMembership` states for its own org filter.
    const caseRow = await supabase
      .from("cases")
      .select("organization_id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseRow.error) return refuse("lookup-failed");
    if (!caseRow.data) return refuse("unknown-case");
    const organizationId = caseRow.data.organization_id;
    // A personal case has no organization, so it has no members to assign. Not
    // reachable through the route — `student.case.assign` is `deny` — but this is
    // a public function and the refusal is cheaper than the assumption.
    if (organizationId === null) return refuse("not-an-org-case");

    const membership = await getOrgMembership(organizationId, membershipId, supabase);
    if (!membership.ok) return refuse("lookup-failed");
    if (!membership.data) return refuse("unknown-member");
    // Any ACTIVE member may hold the slot, not only the `counsellor` role:
    // `is_case_org_member` does not filter role, and an owner or admin carrying
    // cases directly is the normal shape of a small consultancy.
    if (membership.data.status !== "active") return refuse("member-inactive");

    const current = await readPrimaryCounsellor(caseId, supabase);
    if (!current.ok) return refuse("lookup-failed");

    // Churning the row for no change would open the replacement window for
    // nothing, and reporting `changed: true` would tell the admin something
    // happened that did not.
    if (current.data && current.data.userId === membership.data.userId) {
      return { ok: true, changed: false };
    }

    if (current.data) {
      const removed = await supabase
        .from("case_assignments")
        .delete()
        .eq("id", current.data.assignmentId)
        .select("id");
      if (removed.error) {
        return { ok: false, reason: writeFailure(removed.error.code), leftUnassigned: false };
      }
      // A DELETE the policy refuses affects zero rows and raises nothing.
      if (!removed.data || removed.data.length === 0) return refuse("denied");
      deletedExisting = true;
    }

    const inserted = await supabase
      .from("case_assignments")
      .insert({
        case_id: caseId,
        user_id: membership.data.userId,
        assignment_role: PRIMARY_COUNSELLOR_ROLE,
      })
      .select("id")
      .single();

    if (inserted.error || !inserted.data) {
      return {
        ok: false,
        reason: inserted.error ? writeFailure(inserted.error.code) : "write-failed",
        leftUnassigned: deletedExisting,
      };
    }

    return { ok: true, changed: true };
  } catch {
    // If the throw happened after the delete landed, the case really is
    // unassigned and the caller has to be told so.
    return { ok: false, reason: "write-failed", leftUnassigned: deletedExisting };
  }
}
