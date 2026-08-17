import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { patchProfileSectionForCase } from "@/lib/profiles/repo";
import { ProfileSectionPatchBodySchema } from "@/lib/validation/profile-section";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";

/**
 * MV-172 — spec §6.2 **entry 9. This route SPLITS; it does not flip, and its
 * registry entry STAYS.**
 *
 * ## The split
 *
 * | Leg | Client | Why |
 * |---|---|---|
 * | `patchProfileSectionForCase` | **authenticated** | `profiles` UPDATE `(sections, completeness)` was already granted, and MV-168's grant 1 + `.upsert()` conversion made the first-ever INSERT reachable. This is the leg that moves. |
 * | `invalidatePlan` → copy refresh | service-role | UPDATEs `impact, title, body, lift_estimate, time_estimate` — generator-owned columns, refused by spec §6.1's row-6 correction. A client that can rewrite its own plan copy can rewrite the advice. |
 * | `invalidatePlan` / residue → `adoptOwnerKeyedResidue` | service-role | UPDATEs `case_id`, which is omitted from every UPDATE grant BY DESIGN — a client that can update `case_id` re-points a row into another case. |
 * | `reScoreAssessment` | service-role | UPDATEs `assessments.result`. Refused permanently by §6.1 row 3: a client that can write `result` mints its own verdict against the server-side rule. |
 *
 * ## Why flipping it wholesale would have been SILENT
 *
 * `lib/assessments/re-score.ts` never destructures `error` from its `.update()`,
 * and a PostgREST `42501` **resolves rather than rejects**, so it would never
 * reach a `console.error` and the route would still answer `{ ok: true }` with a
 * 200. `throwOnError` appears nowhere in `lib/` or `app/` — the only two mentions
 * are comments describing its absence. Flip this route whole and **every profile
 * edit silently stops updating the student's verdict, with a green suite.** The
 * copy-refresh and residue legs fail the same way.
 *
 * `tests/supabase/service-role-exceptions.test.ts` requires every module
 * constructing the admin client to be registered (`:280`) and every registered
 * entry to still construct one (`:293`), so the entry cannot be deleted while the
 * three refused legs remain — which is the correct outcome, not an obstacle.
 *
 * ## The case id (spec F-8, as amended to seven)
 *
 * F-8 lists five routes; this is the second one it missed, for the same reason as
 * `plan/action` — it was measured through the service-role registry, which gave
 * it a client disposition and said nothing about its case id. Left as-is, the
 * profile editor rendered in a counsellor's case route edits the COUNSELLOR's own
 * profile, and RLS admits it.
 *
 * `resolveTargetCase` is not a field allowlist (MV-153 Finding 1): the Zod payload
 * validation still bounds WHICH fields move, and the TypeScript allowlist that
 * `lib/cases/README.md:152-157` calls for is MV-173's.
 */
export async function PATCH(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ProfileSectionPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  // Resolve and authorize through the AUTHENTICATED client — the case check must
  // not be evaluated by a client that bypasses RLS, and it runs before either
  // client touches a row.
  const target = await resolveTargetCase(
    data.user.id,
    requestedCaseId(body),
    "case.update",
    supabase,
  );
  if (!target.ok) return targetCaseResponse(target, "Couldn't save your profile");
  const { caseId } = target;

  // THE LEG THAT MOVED. On the authenticated client, so `profiles_update_case` /
  // `profiles_insert_case` and the column grant are the enforcement point.
  let result;
  try {
    result = await patchProfileSectionForCase(supabase, caseId, parsed.data.section, parsed.data.patch);
  } catch (err) {
    console.error("[profile/section] patchProfileSectionForCase failed", { caseId, section: parsed.data.section, err });
    return NextResponse.json({ error: "Couldn't save your profile" }, { status: 500 });
  }

  // THE THREE REFUSED LEGS, on an explicitly-scoped admin client constructed only
  // now — after the authorization decision and after the granted write. See the
  // header for why each one cannot move and why moving them would be silent.
  const admin = createSupabaseAdminClient();
  try {
    await invalidatePlan(admin, caseId);
  } catch (err) {
    console.error("[profile/section] invalidatePlan failed", err);
  }
  try {
    await reScoreAssessment(admin, caseId);
  } catch (err) {
    console.error("[profile/section] reScoreAssessment failed", err);
  }
  return NextResponse.json({ ok: true, completeness: result.completeness }, { status: 200 });
}
