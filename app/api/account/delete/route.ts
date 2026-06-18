import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Right-to-delete: removes every trace of the signed-in user — their Storage
 * objects (passports, bank statements, etc.), every owned row, and the auth
 * identity itself. Service-role only; RLS does not gate the admin client.
 *
 * Each step is idempotent (scoped by `owner`), so a retry after a partial
 * failure is safe. We never report ok:true on a partial delete — a silent
 * failure here would leave sensitive data behind while telling the user it was
 * gone, which is the worst possible trust outcome (see MV-02).
 */

// The owned tables, in an order safe even without the FK cascade. `leads`
// cascades away when its parent assessment is deleted, so it is not listed.
const OWNED_TABLES = [
  "plan_items",
  "user_program_state",
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

  // 3. Delete the auth identity itself — without this the email could not be
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

  // 4. End the now-orphaned session so the browser is not left half-authed.
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
