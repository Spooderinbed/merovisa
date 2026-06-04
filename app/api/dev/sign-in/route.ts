import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { assembleAssessment } from "@/lib/results/assemble";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";
import { upsertProfile } from "@/lib/profiles/repo";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import type { StudentProfile } from "@/lib/scoring/types";
import type { Json } from "@/lib/supabase/types";
import type { ProfileSections } from "@/lib/profiles/sections";

const DEV_EMAIL = "dev@merovisa.local";
const DEV_PASSWORD = "MerovisaDevPassword2026!";
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

const SAMPLE_PROFILE: StudentProfile = {
  homeCountry: "nepal",
  destination: "australia",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getUTCFullYear() - 1,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 6.5,
  budget: 3_000_000,
  budgetCurrency: "NPR",
  fundingSource: "parents-family",
  goal: "permanent-residency",
};

/**
 * Dev-only auto sign-in endpoint. Idempotently creates a fixed dev user in
 * Supabase Auth, then signs in via password to set session cookies. On first
 * sign-in (no primary assessment), also seeds a realistic Nepal→Australia
 * assessment + profile so /dashboard, /matches, /plan are populated.
 * Returns 404 in production — the route is functionally dead outside development.
 *
 * Usage: navigate to /api/dev/sign-in (optional ?next=/profile) on localhost.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next")) ?? "/dashboard";

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: "Admin client init failed", detail: String(e) },
      { status: 500 },
    );
  }

  // Idempotent user creation. "already registered" is expected on re-runs.
  const { error: createError } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Dev User" },
  });

  if (
    createError &&
    !createError.message?.toLowerCase().includes("already") &&
    !createError.message?.toLowerCase().includes("registered")
  ) {
    return NextResponse.json(
      { error: "Create user failed", detail: createError.message },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });

  if (signInError || !signInData.user) {
    return NextResponse.json(
      { error: "Sign-in failed", detail: signInError?.message ?? "no user" },
      { status: 500 },
    );
  }

  // Seed sample assessment + profile on first sign-in.
  try {
    await seedDevUserIfNeeded(admin, signInData.user.id);
  } catch (e) {
    console.error("[dev seed] error (non-fatal):", e);
  }

  return NextResponse.redirect(new URL(next, request.url));
}

async function seedDevUserIfNeeded(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string): Promise<void> {
  const existing = await getPrimaryAssessmentForUser(admin, userId);
  if (existing) return;

  const payload = assembleAssessment(SAMPLE_PROFILE, new Date());

  const { error: insertError } = await admin.from("assessments").insert({
    owner: userId,
    profile_snapshot: SAMPLE_PROFILE as unknown as Json,
    destination_id: SAMPLE_PROFILE.destination,
    result: payload as unknown as Json,
    rule_version: payload.result.ruleVersion,
    expires_at: FAR_FUTURE,
    is_primary: true,
  });
  if (insertError) throw new Error(`Assessment insert failed: ${insertError.message}`);

  const sections: ProfileSections = profileSectionsFromAssessment(
    SAMPLE_PROFILE as unknown as Record<string, unknown>,
    { name: "Dev User" },
    { nowYear: new Date().getUTCFullYear() },
  );
  sections.english = {
    ...sections.english,
    test: "ielts",
    overall: 6.5,
    listening: 6.5,
    reading: 6.5,
    writing: 6.0,
    speaking: 7.0,
  };

  const { pct } = computeCompleteness(sections);
  await upsertProfile(admin, { owner: userId, sections, completeness: pct });

  await invalidatePlan(admin, userId);
}
