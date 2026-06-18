import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { isDestinationSupported } from "@/lib/scoring/types";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import type { Program, University } from "@/lib/programs/types";
import { createAnonymousAssessment, getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { assessmentExpiry } from "@/lib/assessments/expiry";
import { getProfile, upsertProfile } from "@/lib/profiles/repo";
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
  // will after signing in. Resilient: listAll* return [] on error, so a catalogue
  // hiccup degrades to an empty match list rather than failing the assessment.
  let programs: Program[] = [];
  let universities: University[] = [];
  try {
    const catalogDb = createSupabaseAdminClient();
    [programs, universities] = await Promise.all([
      listAllPrograms(catalogDb),
      listAllUniversities(catalogDb),
    ]);
  } catch (err) {
    console.error("[/api/assess] catalog fetch failed", err);
  }

  const payload = assembleAssessment(parsed.data, programs, universities);

  let id: string | null = null;
  let persistFailed = false;
  let user: User | null = null;
  try {
    const adminDb = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    user = userData.user;

    if (user) {
      const existingPrimary = await getPrimaryAssessmentForUser(supabase, user.id);
      const { data, error } = await adminDb
        .from("assessments")
        .insert({
          owner: user.id,
          profile_snapshot: parsed.data as unknown as Json,
          destination_id: parsed.data.destination,
          result: payload as unknown as Json,
          rule_version: payload.result.ruleVersion,
          expires_at: FAR_FUTURE,
          is_primary: !existingPrimary,
        })
        .select("id")
        .single();
      if (!error && data) id = data.id;

      const existingProfile = await getProfile(supabase, user.id);
      if (!existingProfile) {
        const googleName = user.user_metadata?.full_name as string | undefined;
        const sections = profileSectionsFromAssessment(parsed.data as unknown as Record<string, unknown>, { name: googleName }, { nowYear: new Date().getUTCFullYear() });
        const { pct } = computeCompleteness(sections);
        await upsertProfile(adminDb, { owner: user.id, sections, completeness: pct });
      }

      await invalidatePlan(adminDb, user.id);
      try {
        await reScoreAssessment(adminDb, user.id);
      } catch (err) {
        console.error("[/api/assess] reScoreAssessment failed", err);
      }
    } else {
      id = await createAnonymousAssessment(adminDb, {
        profileSnapshot: parsed.data as unknown as Json,
        destinationId: parsed.data.destination,
        result: payload as unknown as Json,
        ruleVersion: payload.result.ruleVersion,
        expiresAt: assessmentExpiry(),
      });
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
  return NextResponse.json({ id, payload }, { status: 200 });
}
