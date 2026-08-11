import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestedCaseId, resolveTargetCase, targetCaseResponse } from "@/lib/cases/target-case";
import { getPlanItemKind, setPlanItemStarted, setPlanItemStatus } from "@/lib/plan/repo";
import { completionFor } from "@/lib/plan/completion";

/**
 * MV-172 — spec §6.2 **entry 8, retired**. This route no longer constructs the
 * service-role client and holds no registry entry.
 *
 * ## Why this one genuinely retires and its sibling does not
 *
 * It calls exactly three helpers — `getPlanItemKind` (a read), `setPlanItemStatus`
 * (`status`, `completed_at`) and `setPlanItemStarted` (`started_at`) — and every
 * write is inside the grant `authenticated` already holds,
 * `UPDATE (status, completed_at, started_at)`. It does **not** call
 * `invalidatePlan`; only a comment used to name it. MV-168's grant 5
 * (`plan_items` INSERT) is what the registry entry said it was waiting for, and
 * that grant is live in production.
 *
 * `app/api/profile/section` looks like this route and is not: three of its legs
 * are refused by spec §6.1 permanently, so it SPLITS rather than flips and keeps
 * its entry. See that file's header.
 *
 * ## The case id (spec F-8, as amended to seven)
 *
 * F-8 lists five routes; this is one of the two it missed, because it measured
 * the service-role registry and this route was in it — §6.2 gave it a CLIENT
 * disposition and said nothing about its case id. Parameterizing only F-8's five
 * would have shipped the case route with the plan still writing to the
 * COUNSELLOR's own case.
 */

const BodySchema = z.union([
  z.object({ id: z.number().int().positive(), status: z.enum(["todo", "done", "dismissed"]) }),
  z.object({ id: z.number().int().positive(), started: z.boolean() }),
]);

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await resolveTargetCase(
    data.user.id,
    requestedCaseId(body),
    "case.update",
    supabase,
  );
  if (!target.ok) return targetCaseResponse(target, "no workspace for this account");
  const { caseId } = target;

  // Verified items complete from observed account state (invalidatePlan), never by hand.
  const kind = await getPlanItemKind(supabase, caseId, parsed.data.id);
  const isVerified = kind !== null && completionFor(kind).completion === "verified";
  if (isVerified && ("started" in parsed.data || parsed.data.status === "done")) {
    return NextResponse.json(
      { error: "This item completes automatically from your account — it can't be updated by hand." },
      { status: 422 },
    );
  }

  const ok =
    "started" in parsed.data
      ? await setPlanItemStarted(supabase, caseId, parsed.data.id, parsed.data.started)
      : await setPlanItemStatus(supabase, caseId, parsed.data.id, parsed.data.status);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
