import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Right-to-delete: removes every trace of the signed-in user — their Storage
 * objects (passports, bank statements, etc.), every owned row, their personal
 * `case`, and the auth identity itself. Service-role only; RLS does not gate
 * the admin client.
 *
 * Each step is idempotent (scoped by `owner`, or by `student_user_id` for the
 * personal case), so a retry after a partial failure is safe. We never report
 * ok:true on a partial delete — a silent failure here would leave sensitive
 * data behind while telling the user it was gone, which is the worst possible
 * trust outcome (see MV-02).
 *
 * MV-155 MADE THE PERSONAL-CASE STEP LOAD-BEARING, AND IT IS WHY THIS ROUTE
 * CHANGED. Before MV-155 `public.cases` held zero rows and "every trace" was
 * true by accident. MV-155 mints one personal case per Auth user carrying the
 * student's `display_name` (their real name) and `email` (their real address).
 * `cases.student_user_id` is ON DELETE **SET NULL** while every student table
 * is ON DELETE CASCADE on `owner`, so deleting the Auth user would cascade all
 * nine tables away and LEAVE THE CASES ROW STANDING — a name-and-email record
 * surviving the account deletion, unlinked and therefore un-findable. That is a
 * privacy regression introduced by MV-155, so MV-155 closes it.
 *
 * ONLY PERSONAL CASES (`organization_id IS NULL`). A consultancy case belongs to
 * the organisation, not to the student, and must survive the student closing
 * their MeroVisa account — its lifecycle is Stage 3's. The predicate below says
 * so explicitly rather than relying on there being no consultancy cases yet.
 */

// The owned tables, in an order safe even without the FK cascade — children
// before parents: outcome_events → application_attempts → program_predictions,
// and everything before `assessments` (predictions reference it).
//
// ALL NINE ARE LISTED, AND THE COMPLETENESS IS NOW REQUIRED RATHER THAN TIDY.
// Four of them (`document_status`, `program_predictions`, `application_attempts`,
// `outcome_events`) used to be left to the `owner` FK cascade at step 4. They
// cannot be any more: each carries `case_id` with ON DELETE **RESTRICT** since
// MV-155, so the personal case cannot be deleted while any of their rows still
// reference it — and the case has to go BEFORE the Auth user, because
// `student_user_id` is nulled by the cascade and the row becomes unfindable
// after. Deleting them explicitly here also means a failure is reported and
// retryable while the identity still exists, instead of after it is gone.
//
// `leads` cascades away when its parent assessment is deleted, so it is not listed.
const OWNED_TABLES = [
  "outcome_events",
  "application_attempts",
  "program_predictions",
  "plan_items",
  "user_program_state",
  "document_status",
  "documents",
  "profiles",
  "assessments",
] as const;

export async function POST(request: Request): Promise<Response> {
  // CSRF defense: a cross-site POST will not carry our Origin (or it will
  // mismatch) and the browser will not include a same-site Referer header.
  // Mirrors /auth/signout — doubly important for an irreversible action.
  const self = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const sameOrigin =
    (origin && origin === self) || (referer && referer.startsWith(`${self}/`));
  if (!sameOrigin) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;
  const admin = createSupabaseAdminClient();

  const failedSteps: string[] = [];

  // 1. Remove Storage objects from the private "documents" bucket. The file
  //    paths are keyed `{userId}/{kind}/{name}`, so we read them off the rows
  //    before those rows are deleted.
  const { data: docs, error: listErr } = await admin
    .from("documents")
    .select("file_path")
    .eq("owner", userId);
  if (listErr) failedSteps.push("documents:list");
  const paths = (docs ?? [])
    .map((d) => (d as { file_path: string | null }).file_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error } = await admin.storage.from("documents").remove(paths);
    if (error) failedSteps.push("storage:remove");
  }

  // 2. Delete every owned row.
  for (const table of OWNED_TABLES) {
    const { error } = await admin.from(table).delete().eq("owner", userId);
    if (error) failedSteps.push(`${table}:delete`);
  }

  // 3. Delete the student's PERSONAL case (MV-155). It carries their real name
  //    and email, so it is as much "a trace of the user" as any owned row.
  //
  //    Ordering is forced from both sides: after step 2 (the nine `case_id`
  //    references are ON DELETE RESTRICT, so the case cannot go while any
  //    remain) and before step 4 (`student_user_id` is ON DELETE SET NULL, so
  //    after the Auth user goes the row is no longer identifiable as theirs).
  //
  //    `organization_id is null` keeps consultancy cases out of this: they
  //    belong to the org, not the student, and Stage 3 owns their lifecycle.
  const { error: caseErr } = await admin
    .from("cases")
    .delete()
    .eq("student_user_id", userId)
    .is("organization_id", null);
  if (caseErr) {
    // STOP HERE — do not delete the Auth user. This is the one failure that gets
    // worse if we continue: `student_user_id` is ON DELETE SET NULL, so destroying
    // the identity now would strip the only link between the surviving case and
    // the person it describes, and no retry could ever find it again. Every other
    // step degrades safely (their rows cascade away with the Auth row), which is
    // why this guard is specific rather than a blanket "abort on any failure".
    console.error("[account/delete] personal case not deleted; auth identity preserved for retry", {
      userId,
      error: caseErr.message,
    });
    return NextResponse.json(
      {
        error: "Account deletion did not fully complete. Please try again.",
        failedSteps: [...failedSteps, "cases:delete"],
      },
      { status: 500 },
    );
  }

  // 4. Delete the auth identity itself — without this the email could not be
  //    reused and the account would still "exist".
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) failedSteps.push("auth:deleteUser");

  if (failedSteps.length > 0) {
    console.error("[account/delete] partial failure", { userId, failedSteps });
    return NextResponse.json(
      { error: "Account deletion did not fully complete. Please try again.", failedSteps },
      { status: 500 },
    );
  }

  // 5. End the now-orphaned session so the browser is not left half-authed.
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
