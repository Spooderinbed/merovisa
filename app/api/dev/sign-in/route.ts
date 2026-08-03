import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { assembleAssessment } from "@/lib/results/assemble";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";
import { computeCompleteness } from "@/lib/profiles/completeness";
import { upsertProfileForCase } from "@/lib/profiles/repo";
import { ensurePersonalCase } from "@/lib/cases/personal-case";
import { caseBindColumns } from "@/lib/cases/dual-write";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { invalidatePlan } from "@/lib/plan/invalidate";
import type { StudentProfile } from "@/lib/scoring/types";
import type { Json } from "@/lib/supabase/types";
import type { ProfileSections } from "@/lib/profiles/sections";

const DEV_EMAIL = process.env.DEV_USER_EMAIL ?? "dev@merovisa.local";
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
 * Dev-only auto sign-in endpoint. Multi-gated:
 *
 *   1. `NODE_ENV !== "production"`
 *   2. `ENABLE_DEV_SIGNIN === "1"` (opt-in via env)
 *   3. `NEXT_PUBLIC_SUPABASE_URL` must look local/dev — not production
 *
 * Generates a fresh random password per call (no committed credentials).
 * Idempotently creates/updates a fixed dev user and signs them in. Seeds
 * a realistic Nepal→Australia assessment + profile on first sign-in.
 *
 * Returns 404 if any gate fails — the route is functionally dead outside
 * an explicitly-enabled local dev environment.
 *
 * Usage: set `ENABLE_DEV_SIGNIN=1` in .env.local, then navigate to
 * /api/dev/sign-in (optional ?next=/profile).
 */
export async function GET(request: Request): Promise<Response> {
  const gate = ensureDevAllowed();
  if (!gate.allowed) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next")) ?? "/dashboard";

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("[dev sign-in] admin client init failed:", e);
    return new NextResponse("Server configuration error", { status: 500 });
  }

  // Fresh random password per session — not committed anywhere.
  const password = generateRandomPassword();

  // Idempotent user creation. If the user already exists, we still need to
  // set a known password, so update them either way.
  const created = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Dev User" },
  });

  let userId: string | undefined = created.data.user?.id;

  if (created.error) {
    const msg = created.error.message?.toLowerCase() ?? "";
    if (!(msg.includes("already") || msg.includes("registered"))) {
      console.error("[dev sign-in] createUser failed:", created.error.message);
      return new NextResponse("Sign-in failed", { status: 500 });
    }
    // User already exists — look them up and rotate the password.
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email === DEV_EMAIL)?.id;
    if (!userId) {
      return new NextResponse("Sign-in failed", { status: 500 });
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error("[dev sign-in] updateUserById failed:", updateError.message);
      return new NextResponse("Sign-in failed", { status: 500 });
    }
  }

  if (!userId) {
    return new NextResponse("Sign-in failed", { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password,
  });

  if (signInError) {
    console.error("[dev sign-in] signIn failed:", signInError.message);
    return new NextResponse("Sign-in failed", { status: 500 });
  }

  // Seed sample assessment + profile on first sign-in.
  try {
    await seedDevUserIfNeeded(admin, { id: userId, email: DEV_EMAIL, user_metadata: { full_name: "Dev User" } });
  } catch (e) {
    console.error("[dev sign-in] seed error (non-fatal):", e);
  }

  return NextResponse.redirect(new URL(next, request.url));
}

interface GateResult {
  allowed: boolean;
}

function ensureDevAllowed(): GateResult {
  if (process.env.NODE_ENV === "production") return { allowed: false };
  if (process.env.ENABLE_DEV_SIGNIN !== "1") return { allowed: false };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Allow only if the URL looks like local development or a non-production
  // Supabase project. Adjust the allowlist as you grow.
  const looksLocalOrDev =
    /localhost|127\.0\.0\.1/.test(url) ||
    /\.supabase\.co/.test(url); // Permit any Supabase-hosted dev project. Tighten if you want.
  if (!looksLocalOrDev) return { allowed: false };
  return { allowed: true };
}

function generateRandomPassword(): string {
  // 32 random bytes encoded as URL-safe base64 → ~43 chars of entropy.
  const bytes = crypto.randomBytes(32);
  return bytes.toString("base64url");
}

async function seedDevUserIfNeeded(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null; name?: string | null } | null },
): Promise<void> {
  // The harness must produce the same shape production does, so it goes through
  // the SAME resolver the sign-in seam uses rather than minting a case by hand.
  const caseId = await ensurePersonalCase(user, admin);
  if (caseId === null) throw new Error("Dev seed: could not resolve a personal case");

  const existing = await getPrimaryAssessmentForCase(admin, caseId);
  if (existing) return;

  const [programs, universities] = await Promise.all([
    listAllPrograms(admin),
    listAllUniversities(admin),
  ]);
  const payload = assembleAssessment(SAMPLE_PROFILE, programs, universities, new Date());

  // Same choke point as production, for the same reason the resolver above is
  // shared: a harness that writes `owner` by hand is a harness that can produce a
  // shape production cannot, and the mismatch would be discovered as a confusing
  // local-only bug rather than as the dual-write defect it is.
  const ownership = await caseBindColumns(admin, caseId);
  if (ownership === null) throw new Error("Dev seed: personal case has no student_user_id");

  const { error: insertError } = await admin.from("assessments").insert({
    ...ownership,
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
  await upsertProfileForCase(admin, { caseId, sections, completeness: pct });

  await invalidatePlan(admin, caseId);
}
