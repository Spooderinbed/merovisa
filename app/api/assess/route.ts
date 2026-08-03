import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { isDestinationSupported } from "@/lib/scoring/types";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import type { Program, University } from "@/lib/programs/types";
import { createAnonymousAssessment, getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { ensurePersonalCase } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { assessmentExpiry } from "@/lib/assessments/expiry";
import { getProfileForCase, upsertProfileForCase } from "@/lib/profiles/repo";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";
import { invalidatePlan } from "@/lib/plan/invalidate";
import { reScoreAssessment } from "@/lib/assessments/re-score";
import type { Json } from "@/lib/supabase/types";
import { checkRateLimit, ipFromRequest } from "@/lib/rate-limit/upstash";
import type { User } from "@supabase/supabase-js";

const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

export async function POST(request: Request): Promise<Response> {
  const ip = ipFromRequest(request);
  if (!(await checkRateLimit("assess", ip, 10, "1 m"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!(await checkRateLimit("assess-daily", ip, 100, "1 d"))) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  // Destination honesty: never silently assess an unsupported corridor as Australia.
  // "not-sure" is explicit delegation and passes through (the Results UI says how
  // we resolved it). See docs/superpowers/specs/2026-06-10-destination-honesty-design.md.
  const dest = parsed.data.destination;
  if (!isDestinationSupported(dest) && dest !== "not-sure") {
    return NextResponse.json(
      { error: `Destination not supported yet: ${dest}` },
      { status: 422 },
    );
  }

  // The match set reads the live program/university catalogue — the same source the
  // signed-in matches page uses — so an anonymous student sees the same matches they
  // will after signing in. A read that FAILS is not an empty catalogue (MV-133): scoring
  // against [] hands a student who just finished the nine-step wizard a verdict with zero
  // matches — "nothing fits you" — and for a signed-in user persists that fabrication as
  // their assessment of record. Fail honestly instead; the wizard keeps their answers in
  // memory, so retrying costs them nothing.
  let programs: Program[];
  let universities: University[];
  try {
    const catalogDb = createSupabaseAdminClient();
    [programs, universities] = await Promise.all([
      listAllPrograms(catalogDb),
      listAllUniversities(catalogDb),
    ]);
  } catch (err) {
    console.error("[/api/assess] catalog fetch failed", err);
    return NextResponse.json(
      { error: "We couldn't load the program catalogue just now. Please try again." },
      { status: 503 },
    );
  }

  const payload = assembleAssessment(parsed.data, programs, universities);

  let id: string | null = null;
  let expiresAt: string | null = null;
  let persistFailed = false;
  let user: User | null = null;
  try {
    const adminDb = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    user = userData.user;

    if (user) {
      // MV-157: resolve AND authorize the case before the signed-in insert.
      // `ensurePersonalCase` (not the read-only resolver) is used here because
      // this is the first student-owned row a converting account writes, and an
      // assessment persisted with a null `case_id` is exactly the silent-loss
      // state Stage 2 exists to prevent: the row is saved, the sign-in succeeded,
      // and the case-scoped dashboard renders nothing. The admin client is
      // required — `cases_insert_admin` refuses a personal case (its WITH CHECK
      // demands `organization_id IS NOT NULL`), so the authenticated client
      // cannot create one. This route is already a registered service-role
      // exception, so no new call site is introduced.
      const caseId = await ensurePersonalCase(user, adminDb);
      const allowed =
        caseId !== null &&
        (await checkCasePermission(user.id, caseId, "case.update", supabase)).decision.allowed;

      if (caseId === null || !allowed) {
        console.error("[/api/assess] case resolution or authorization failed", {
          userId: user.id,
          resolved: caseId !== null,
        });
        persistFailed = true;
      } else {
        const existingPrimary = await getPrimaryAssessmentForCase(supabase, caseId);
        const { data, error } = await adminDb
          .from("assessments")
          .insert({
            owner: user.id,
            case_id: caseId,
            profile_snapshot: parsed.data as unknown as Json,
            destination_id: parsed.data.destination,
            result: payload as unknown as Json,
            rule_version: payload.result.ruleVersion,
            expires_at: FAR_FUTURE,
            is_primary: !existingPrimary,
          })
          .select("id")
          .single();
        if (error || !data) {
          // PostgREST reports a failed write as a value, not a throw — surface it
          // instead of returning 200 with id:null. Skip the dependent writes.
          console.error("[/api/assess] assessment insert failed", { caseId, err: error });
          persistFailed = true;
        } else {
          id = data.id;

          const existingProfile = await getProfileForCase(supabase, caseId);
          if (!existingProfile) {
            const googleName = user.user_metadata?.full_name as string | undefined;
            const sections = profileSectionsFromAssessment(parsed.data as unknown as Record<string, unknown>, { name: googleName }, { nowYear: new Date().getUTCFullYear() });
            const { pct } = computeCompleteness(sections);
            const bootstrapId = await upsertProfileForCase(adminDb, { caseId, sections, completeness: pct });
            if (!bootstrapId) {
              console.error("[/api/assess] profile bootstrap upsert failed", { caseId });
            }
          }

          // Derived side-effects: the assessment is already saved, so a failure here must
          // not be reported as a failed save. Both can now throw on their own (their own
          // catalogue reads surface errors since MV-133) — caught and logged, as they are
          // at every other call site.
          try {
            await invalidatePlan(adminDb, caseId);
          } catch (err) {
            console.error("[/api/assess] invalidatePlan failed", err);
          }
          try {
            await reScoreAssessment(adminDb, caseId);
          } catch (err) {
            console.error("[/api/assess] reScoreAssessment failed", err);
          }
        }
      }
    } else {
      // Capture the stored expiry so the client (TREE-2 fresh flow) can show the
      // real created+3d day without reading its own clock (MV-118 #4).
      expiresAt = assessmentExpiry();
      id = await createAnonymousAssessment(adminDb, {
        profileSnapshot: parsed.data as unknown as Json,
        destinationId: parsed.data.destination,
        result: payload as unknown as Json,
        ruleVersion: payload.result.ruleVersion,
        expiresAt,
      });
      // Anonymous assessments are ephemeral (3-day) — a persist miss still shows
      // the payload (id:null) by design, but log it so the funnel gap is visible.
      if (id === null) {
        console.error("[/api/assess] anonymous assessment persist failed");
      }
    }
  } catch (err) {
    console.error("[/api/assess] persist failed", err);
    persistFailed = true;
    id = null;
  }

  if (persistFailed && user) {
    // Authenticated users expect persistence; surface the failure.
    return NextResponse.json(
      { error: "Failed to save assessment", payload },
      { status: 500 },
    );
  }
  return NextResponse.json({ id, payload, expiresAt }, { status: 200 });
}
