import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseAuthorizationClient } from "./context";
import { CaseReadError } from "./errors";

/**
 * The personal case — the ONE way a personal route turns an actor into a case id
 * (MV-157 §A). Every migrated repository takes a `caseId`; this module is where
 * that id comes from, and it is deliberately the only such place: two
 * create-or-resolve implementations of "one personal case per student" is
 * precisely the shape that produces two personal cases per student.
 *
 * A personal case is `organization_id IS NULL AND student_user_id = actor`. It
 * satisfies the **student** row of the canonical access matrix and no `all-org`
 * claim — a consultancy case for the same student is a different workspace and
 * must never answer for the personal one.
 *
 * ## Which client to hand it
 *
 * - `resolvePersonalCaseId` reads, and the AUTHENTICATED client is the right
 *   default: `cases_select_accessor` admits `student_user_id = auth.uid()`.
 * - `ensurePersonalCase` may INSERT, and the authenticated client **cannot** do
 *   that. MV-152's `cases_insert_admin` is the only INSERT policy on `cases` and
 *   its `WITH CHECK` requires `organization_id IS NOT NULL`, so a student
 *   creating their own (organization-less) personal case is rejected with
 *   `42501 new row violates row-level security policy`. Measured, not reasoned —
 *   see `tests/integration/case-data-access.itest.ts` §"personal case creation".
 *   Callers therefore hand it a service-role client, and they are exactly the two
 *   already-registered account-linking exceptions (`lib/auth/finish-sign-in.ts`,
 *   plus the dev sign-in harness). This module names no service-role key and
 *   imports no admin factory: it uses the client it is handed, so it adds no
 *   entry to `lib/supabase/service-role-exceptions.ts`.
 *
 * Neither function authorizes anything. Resolution is not permission —
 * `requireCasePermission` still runs at the entry point (MV-157 §A).
 */

/**
 * The slice of `supabase.auth.getUser()`'s user this module reads.
 *
 * It takes the VERIFIED `User` object rather than a `{ displayName, email }` bag,
 * and that is the whole proof (MV-158 §A): once identity arrives as two plain
 * strings, nothing in the function — at any layer — can distinguish a value the
 * caller read off `supabase.auth.getUser()` from one it read off a request body,
 * and "non-session values are ignored" becomes a claim no test can falsify. With
 * the session object as the parameter there is no channel through which a
 * client-supplied string can reach `cases.display_name` or `cases.email`, so the
 * property is true by construction. Any future PR that re-adds a string identity
 * parameter re-opens that decision.
 */
export interface PersonalCaseSessionUser {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string | null; name?: string | null } | null;
}

/** A stable, non-empty last resort: `cases.display_name` is NOT NULL. */
const DISPLAY_NAME_FALLBACK = "MeroVisa student";

function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * `display_name`, derived INSIDE this module from the verified session (MV-158
 * §A): `user_metadata.full_name` → `user_metadata.name` → the email local-part →
 * a stable fallback. Never `""`, never the literal `"undefined"`, never null.
 *
 * The precedence exists so Google and email sessions agree on the same available
 * data — the derivation reads the `User`, not the provider, so there is no
 * provider fork to drift (MV-147: do not fork the claim path).
 */
function derivePersonalCaseIdentity(user: PersonalCaseSessionUser): {
  displayName: string;
  email: string | null;
} {
  const email = isPresent(user.email) ? user.email.trim() : null;
  const fullName = user.user_metadata?.full_name;
  const name = user.user_metadata?.name;

  let displayName: string | null = null;
  if (isPresent(fullName)) displayName = fullName.trim();
  else if (isPresent(name)) displayName = name.trim();
  else if (email !== null) {
    const localPart = email.split("@")[0]?.trim() ?? "";
    if (localPart.length > 0) displayName = localPart;
  }

  return { displayName: displayName ?? DISPLAY_NAME_FALLBACK, email };
}

/**
 * The actor's personal case id, or null when they have none.
 *
 * `organization_id IS NULL` is part of the predicate, not a post-filter: a
 * student linked to a consultancy case must not have that case returned here.
 *
 * ## `null` means "no case", NOT "the read failed" — MV-133, recurring
 *
 * This used to end `if (error || !data) return null` with no log, and the review
 * that caught it is right to call it a recurrence rather than a nitpick. Every
 * caller treats `null` as *the actor has no personal case*, which is a real,
 * benign state (a brand-new account) rendered as an empty dashboard. Folding a
 * PostgREST error into the same value makes an outage — and specifically the
 * `42703 undefined column` a hosted database without MV-155's migration returns
 * on **every** migrated read, which is the exact failure both cards gate the
 * merge on — render as "you have no data". That is the lie MV-133 exists to end,
 * so a real error now THROWS `CaseReadError` and `null` is reserved for the query
 * that answered with nothing.
 *
 * It does still fail closed on the security question: nothing about a thrown read
 * grants access, and `requireCasePermission` is a separate call regardless.
 */
export async function resolvePersonalCaseId(
  actorUserId: string,
  db?: CaseAuthorizationClient,
): Promise<string | null> {
  if (!isPresent(actorUserId)) return null;

  const client = db ?? (await createSupabaseServerClient());
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await client
      .from("cases")
      .select("id")
      .eq("student_user_id", actorUserId)
      .is("organization_id", null)
      .maybeSingle());
  } catch (err) {
    // A dropped connection or an aborted request never answered either — same
    // honesty rule, and it must not be flattened into "no personal case".
    console.error("[cases] personal-case lookup threw", { err });
    throw new CaseReadError("cases", err);
  }
  if (error) {
    console.error("[cases] personal-case lookup failed", { error });
    throw new CaseReadError("cases", error);
  }
  if (!data) return null;
  return (data as { id: string }).id;
}

/**
 * Create-or-resolve the actor's personal case. Idempotent and race-safe under
 * MV-155's `cases_personal_student_idx` (partial unique on
 * `cases (student_user_id) WHERE organization_id IS NULL`): concurrent callers
 * for one actor return the SAME id and never create a second case.
 *
 * The unique violation is handled as a RESOLVE, not an error — the loser of the
 * race re-reads and returns the winner's case. That branch is not decoration: a
 * read-then-insert without it is a lost update, and two personal cases silently
 * split one student's data across two workspaces.
 *
 * NOTE it is a read-then-insert-then-re-read rather than an upsert **because the
 * index is partial**. Postgres infers a partial unique index as an `ON CONFLICT`
 * arbiter only when the statement supplies the predicate, and PostgREST's
 * `on_conflict=` emits a bare column list — an upsert here would raise `42P10`
 * (spec §4 rule 1, the same mechanism that made the four case-keyed arbiters
 * full). The predicate is load-bearing on this index, so the index stays partial
 * and the code does the retry instead.
 *
 * Returns null on failure rather than throwing, so the claim seam can report a
 * retryable `error` (MV-158 F4) instead of telling a student their still-present
 * assessment is gone. That includes the `CaseReadError` its own resolver now
 * raises: at THIS seam a failed lookup and an absent case both mean "we could not
 * give you a workspace, try again", and the claim already routes null to the
 * retryable leg. The catch logs rather than swallowing, so the distinction
 * survives in the server log even though the return value collapses it.
 */
export async function ensurePersonalCase(
  sessionUser: PersonalCaseSessionUser,
  db?: CaseAuthorizationClient,
): Promise<string | null> {
  if (!isPresent(sessionUser?.id)) return null;
  const actorUserId = sessionUser.id;

  try {
    const client = db ?? (await createSupabaseServerClient());

    const existing = await resolvePersonalCaseId(actorUserId, client);
    if (existing !== null) return existing;

    const { displayName, email } = derivePersonalCaseIdentity(sessionUser);
    const { data, error } = await client
      .from("cases")
      .insert({
        display_name: displayName,
        email,
        student_user_id: actorUserId,
        organization_id: null,
      })
      .select("id")
      .single();

    if (!error && data) return (data as { id: string }).id;

    // 23505 means a concurrent caller won `cases_personal_student_idx`. Re-read
    // and return theirs; any other error is a genuine failure the caller must be
    // able to see.
    if (error?.code === "23505") return await resolvePersonalCaseId(actorUserId, client);
    console.error("[cases] personal-case create failed", { actorUserId, error });
    return null;
  } catch (err) {
    console.error("[cases] personal-case create-or-resolve failed", { actorUserId, err });
    return null;
  }
}
