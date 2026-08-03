/**
 * MV-18 — Real-DB claim-path integration smoke.
 *
 * Drives `claimAndBootstrapProfile` against a REAL local Postgres with the real
 * migrations applied (incl. the partial-unique index `assessments_primary_idx`),
 * so it catches the class of bug the mocked unit tests structurally cannot: a real
 * DB constraint rejecting a write that a supabase-js mock would happily "accept"
 * (the swallowed-index failure behind the MV-16 dashboard-pinning regression).
 *
 * The claim layer is auth-method-agnostic — it takes the VERIFIED session `User`
 * object, not a provider — so we mint a throwaway user via
 * `auth.admin.createUser`, no OAuth round-trip required. Only
 * `exchangeCodeForSession` is Google-specific and stays a founder live-smoke.
 *
 * MV-158 EXTENDED THIS FILE with the case model. The additions are the ones only a
 * real database can answer:
 *   - one personal case per claimer, under a real partial unique index;
 *   - the atomic bind landing `owner` AND `case_id` together;
 *   - exactly one primary asserted under BOTH the owner-scoped and case-scoped
 *     predicates — the assertion that goes red if the demote is scoped to one key;
 *   - `Promise.all` of two concurrent claims of the same row;
 *   - the purge interaction in both directions;
 *   - and the invariant MV-160 depends on: a CLAIMED assessment always has a
 *     non-null `owner`, proved for every successful leg.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the
 * default `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts).
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY —
 * never point this at prod; it writes and deletes rows.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));

import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import {
  createAnonymousAssessment,
  createLead,
  getPrimaryAssessmentForCase,
  getAssessmentById,
} from "@/lib/assessments/repo";
import { purgeUnclaimedAnonymousAssessments, ANON_RETENTION_DAYS } from "@/lib/assessments/purge";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

describe.skipIf(!url || !serviceKey)("claim path against a real local Postgres", () => {
  let admin: SupabaseClient<Database>;
  let userId: string;
  /** The verified session object the claim path takes. Minted, never fabricated. */
  let sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };
  // Unique per run so a failed teardown never collides with the next run.
  const email = `mv18-claim-smoke-${Date.now()}@example.test`;
  const seededAssessmentIds: string[] = [];
  const seededUserIds: string[] = [];

  const seedAnonymousAssessment = async (): Promise<string> => {
    const id = await createAnonymousAssessment(admin, {
      profileSnapshot: { destination: "australia" },
      destinationId: "australia",
      result: { verdict: "possible" },
      ruleVersion: "v0.5.0-itest",
      // Future expiry: claimAssessment requires `expires_at > now`.
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!id) throw new Error("failed to seed anonymous assessment");
    seededAssessmentIds.push(id);
    return id;
  };

  const primaryIdsForOwner = async (): Promise<string[]> => {
    const { data, error } = await admin
      .from("assessments")
      .select("id")
      .eq("owner", userId)
      .eq("is_primary", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id);
  };

  /**
   * The SAME question asked through the other key. MV-158 §D: the demote has to
   * satisfy BOTH live predicates while both indexes exist, and a demote scoped to
   * only one of them leaves this list disagreeing with `primaryIdsForOwner`.
   */
  const primaryIdsForCase = async (caseId: string): Promise<string[]> => {
    const { data, error } = await admin
      .from("assessments")
      .select("id")
      .eq("case_id", caseId)
      .eq("is_primary", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id);
  };

  const mintUser = async (label: string) => {
    const addr = `mv158-${label}-${Date.now()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email: addr,
      email_confirm: true,
      user_metadata: { full_name: `MV158 ${label}` },
    });
    if (error || !data.user) throw new Error(`failed to mint ${label}: ${error?.message}`);
    seededUserIds.push(data.user.id);
    return data.user;
  };

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Claim Smoke" },
    });
    if (error || !data.user) throw new Error(`failed to mint test user: ${error?.message}`);
    userId = data.user.id;
    sessionUser = data.user;
  });

  afterAll(async () => {
    if (!admin) return;
    if (seededAssessmentIds.length) {
      await admin.from("assessments").delete().in("id", seededAssessmentIds);
    }
    // Deleting the auth user cascades to its owned assessments, profile, and
    // leads — but NOT to `cases`, whose `student_user_id` is ON DELETE SET NULL
    // and whose `case_id` references are ON DELETE RESTRICT. So the seeded rows
    // go first, then the personal cases, then the users.
    const everyUser = [userId, ...seededUserIds].filter(Boolean);
    for (const table of ["profiles", "assessments", "plan_items", "user_program_state"] as const) {
      await admin.from(table).delete().in("owner", everyUser);
    }
    await admin.from("cases").delete().in("student_user_id", everyUser).is("organization_id", null);
    for (const id of everyUser) await admin.auth.admin.deleteUser(id);
  });

  it("a second claim becomes primary and demotes the first (newest-wins)", async () => {
    const a1 = await seedAnonymousAssessment();
    const a2 = await seedAnonymousAssessment();

    const r1 = await claimAndBootstrapProfile(admin, { assessmentId: a1, user: sessionUser });
    expect(r1.claimed).toBe(true);

    const caseId = await resolvePersonalCaseId(userId, admin);
    expect(caseId).not.toBeNull();
    expect((await getPrimaryAssessmentForCase(admin, caseId!))?.id).toBe(a1);

    const r2 = await claimAndBootstrapProfile(admin, { assessmentId: a2, user: sessionUser });
    expect(r2.claimed).toBe(true);

    // Exactly one primary, and it is the newest (a2). This is the assertion that
    // goes RED against the pre-MV-16 single-promote code: the second promote trips
    // assessments_primary_idx, the error is swallowed, and a1 stays primary.
    //
    // MV-158 asks it under BOTH keys. A demote scoped to `case_id` alone leaves a
    // same-owner primary in another case, the promote then trips the LEGACY
    // owner-keyed index, and the dashboard silently stays pinned to the first
    // assessment ever claimed — MV-16, re-created by the tidier-looking rewrite.
    expect(await primaryIdsForOwner()).toEqual([a2]);
    expect(await primaryIdsForCase(caseId!)).toEqual([a2]);
    expect((await getAssessmentById(admin, a1))?.is_primary).toBe(false);
  });

  it("a successful claim records a lead and bootstraps a profile; a re-claim does not duplicate", async () => {
    const a = await seedAnonymousAssessment();

    const r = await claimAndBootstrapProfile(admin, { assessmentId: a, user: sessionUser });
    expect(r.claimed).toBe(true);

    const lead = await admin.from("leads").select("id").eq("assessment_id", a).eq("email", email);
    expect(lead.data?.length).toBe(1);

    const profile = await admin.from("profiles").select("owner").eq("owner", userId).maybeSingle();
    expect(profile.data?.owner).toBe(userId);

    // Re-claiming an already-owned assessment short-circuits (owner is no longer
    // null), so no second lead is even attempted — still exactly one.
    const reclaim = await claimAndBootstrapProfile(admin, { assessmentId: a, user: sessionUser });
    expect(reclaim.claimed).toBe(false);
    const leadAfter = await admin.from("leads").select("id").eq("assessment_id", a).eq("email", email);
    expect(leadAfter.data?.length).toBe(1);
  });

  it("createLead is idempotent on (assessment_id, email) at the DB level", async () => {
    const a = await seedAnonymousAssessment();
    // Exercises the leads_assessment_email_uniq constraint + ignoreDuplicates
    // upsert directly: a second insert must neither throw nor duplicate.
    await createLead(admin, { email, assessmentId: a });
    await createLead(admin, { email, assessmentId: a });
    const leads = await admin.from("leads").select("id").eq("assessment_id", a).eq("email", email);
    expect(leads.data?.length).toBe(1);
  });

  // =====================================================================
  // MV-158 — the case model, proved against a real database.
  // =====================================================================

  it("a claim by a BRAND-NEW user creates exactly one personal case and binds owner + case_id", async () => {
    const fresh = await mintUser("fresh");
    const a = await seedAnonymousAssessment();

    const r = await claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh });
    expect(r.claimed).toBe(true);

    const { data: cases } = await admin
      .from("cases")
      .select("id")
      .eq("student_user_id", fresh.id)
      .is("organization_id", null);
    expect(cases).toHaveLength(1);

    const row = await getAssessmentById(admin, a);
    expect(row?.owner).toBe(fresh.id);
    expect(row?.case_id).toBe(cases![0]!.id);
    expect(row?.claimed_at).not.toBeNull();
  });

  it("the bootstrapped profile carries the SAME case_id as the assessment", async () => {
    const fresh = await mintUser("profile-case");
    const a = await seedAnonymousAssessment();

    await claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh });

    const row = await getAssessmentById(admin, a);
    const { data: profile } = await admin
      .from("profiles")
      .select("case_id, owner")
      .eq("owner", fresh.id)
      .maybeSingle();
    expect(profile?.case_id).toBe(row?.case_id);
    expect(profile?.owner).toBe(fresh.id);
  });

  it("a second claim by the same user REUSES the case and leaves exactly one primary under both keys", async () => {
    const fresh = await mintUser("reuse");
    const a1 = await seedAnonymousAssessment();
    const a2 = await seedAnonymousAssessment();

    await claimAndBootstrapProfile(admin, { assessmentId: a1, user: fresh });
    const caseAfterFirst = await resolvePersonalCaseId(fresh.id, admin);
    await claimAndBootstrapProfile(admin, { assessmentId: a2, user: fresh });
    const caseAfterSecond = await resolvePersonalCaseId(fresh.id, admin);

    expect(caseAfterSecond).toBe(caseAfterFirst);
    const { data: cases } = await admin
      .from("cases")
      .select("id")
      .eq("student_user_id", fresh.id)
      .is("organization_id", null);
    expect(cases).toHaveLength(1);

    const { data: byOwner } = await admin
      .from("assessments").select("id").eq("owner", fresh.id).eq("is_primary", true);
    const { data: byCase } = await admin
      .from("assessments").select("id").eq("case_id", caseAfterSecond!).eq("is_primary", true);
    expect(byOwner!.map((r) => r.id)).toEqual([a2]);
    expect(byCase!.map((r) => r.id)).toEqual([a2]);
  });

  it("two CONCURRENT claims of the same assessment: one case, one bound row, one primary, both callers land", async () => {
    // The double sign-in inside the 24h token TTL, or two tabs. Only a real
    // partial unique index can adjudicate the race.
    const fresh = await mintUser("race");
    const a = await seedAnonymousAssessment();

    const [r1, r2] = await Promise.all([
      claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh }),
      claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh }),
    ]);

    // One binds, the other classifies as `already-mine` — which the seam treats
    // as a success and lands on the same assessment.
    const landed = [r1, r2].map((r) => r.claimed || r.reason === "already-mine");
    expect(landed).toEqual([true, true]);

    const { data: cases } = await admin
      .from("cases").select("id").eq("student_user_id", fresh.id).is("organization_id", null);
    expect(cases).toHaveLength(1);

    const row = await getAssessmentById(admin, a);
    expect(row?.owner).toBe(fresh.id);
    expect(row?.case_id).toBe(cases![0]!.id);

    const { data: primaries } = await admin
      .from("assessments").select("id").eq("owner", fresh.id).eq("is_primary", true);
    expect(primaries).toHaveLength(1);
  });

  it("a row claimed by A and then targeted by B stays A's — B gets `claimed` and writes nothing", async () => {
    const alice = await mintUser("alice");
    const bob = await mintUser("bob");
    const a = await seedAnonymousAssessment();

    await claimAndBootstrapProfile(admin, { assessmentId: a, user: alice });
    const before = await getAssessmentById(admin, a);

    const attempt = await claimAndBootstrapProfile(admin, { assessmentId: a, user: bob });

    expect(attempt).toEqual({ claimed: false, reason: "claimed" });
    const after = await getAssessmentById(admin, a);
    expect(after?.owner).toBe(alice.id);
    expect(after?.case_id).toBe(before?.case_id);
  });

  it("THE DEMOTE MUST SATISFY BOTH KEYS — a same-owner, case-less primary is demoted too", async () => {
    // THIS is the case that distinguishes the two demotes, and the first version
    // of this suite did NOT have it: for an ordinary personal user, owner ↔ case
    // is 1:1, so `demote where case_id = X` and `demote where owner = Y` select
    // exactly the same rows and a case-scoped-only demote passes every other
    // assertion here. Mutation-checking the demote is what exposed that — the
    // "exactly one primary under both keys" tests above were green against the
    // WRONG implementation.
    //
    // The row that separates them is an owned, is_primary row carrying NO
    // case_id — precisely the residue F2 exists to heal, and precisely what a
    // case-scoped demote cannot see. Leave it primary and the promote below
    // trips the surviving `assessments_primary_idx (owner) WHERE is_primary`,
    // the error is logged rather than thrown, and the student's dashboard stays
    // pinned to the older assessment. That is MV-16, exactly.
    const fresh = await mintUser("both-keys");
    const stale = await seedAnonymousAssessment();
    await claimAndBootstrapProfile(admin, { assessmentId: stale, user: fresh });
    await admin.from("assessments").update({ case_id: null }).eq("id", stale);
    expect((await getAssessmentById(admin, stale))?.is_primary).toBe(true);

    const fresher = await seedAnonymousAssessment();
    const r = await claimAndBootstrapProfile(admin, { assessmentId: fresher, user: fresh });
    expect(r.claimed).toBe(true);

    // Newest wins, and the case-less straggler was demoted with it.
    expect((await getAssessmentById(admin, fresher))?.is_primary).toBe(true);
    expect((await getAssessmentById(admin, stale))?.is_primary).toBe(false);
    const { data: primaries } = await admin
      .from("assessments").select("id").eq("owner", fresh.id).eq("is_primary", true);
    expect(primaries!.map((r2) => r2.id)).toEqual([fresher]);
  });

  it("F2 — a re-claim HEALS an owned row whose case_id is null", async () => {
    const fresh = await mintUser("heal");
    const a = await seedAnonymousAssessment();
    await claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh });

    // Manufacture the residue this branch exists for: owned, but case-less.
    await admin.from("assessments").update({ case_id: null }).eq("id", a);
    expect((await getAssessmentById(admin, a))?.case_id).toBeNull();

    const reclaim = await claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh });

    expect(reclaim).toEqual({ claimed: false, reason: "already-mine" });
    const caseId = await resolvePersonalCaseId(fresh.id, admin);
    expect((await getAssessmentById(admin, a))?.case_id).toBe(caseId);
  });

  it("a PURGED row claimed afterwards renders `expired`, bootstraps nothing, and leaves no orphan evidence", async () => {
    const fresh = await mintUser("purged");
    const a = await seedAnonymousAssessment();
    // Age it past both halves of MV-135's predicate, then run the REAL purge.
    const long = new Date(Date.now() - (ANON_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("assessments").update({ created_at: long, expires_at: long }).eq("id", a);
    await purgeUnclaimedAnonymousAssessments(admin);
    expect(await getAssessmentById(admin, a)).toBeNull();

    const r = await claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh });

    // `expired` — never `claim-failed`, never a blank page. The personal case
    // created a moment earlier is explicitly NOT an orphan (a per-user singleton
    // the account needs anyway), and it is NOT evidence of a successful claim.
    expect(r).toEqual({ claimed: false, reason: "expired" });
    const { data: profile } = await admin.from("profiles").select("id").eq("owner", fresh.id).maybeSingle();
    expect(profile).toBeNull();
  });

  it("an OWNED, case_id-null row survives a real purge run", async () => {
    // The MV-135 landmine restated against the case model: a claim never extends
    // `expires_at`, so every converted student's row looks permanently expired,
    // and `owner is null` is the only thing separating it from an abandoned one.
    const fresh = await mintUser("survivor");
    const a = await seedAnonymousAssessment();
    await claimAndBootstrapProfile(admin, { assessmentId: a, user: fresh });
    const long = new Date(Date.now() - (ANON_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("assessments").update({ case_id: null, created_at: long, expires_at: long }).eq("id", a);

    await purgeUnclaimedAnonymousAssessments(admin);

    expect(await getAssessmentById(admin, a)).not.toBeNull();
  });

  it("THE MV-160 PRECONDITION — every successful claim leg leaves `owner` non-null wherever `claimed_at` is set", async () => {
    // MV-160 §B applies a CHECK to `assessments` covering claimed_at-set rows,
    // and MV-155's repair sweep only repairs OWNED rows. A claimed-but-owner-null
    // row would abort that tighten migration against live data. The claim path is
    // BELIEVED to always set `owner` — believed, because no card asserted it.
    // This card owns the claim path, so this card asserts it, for every leg.
    const google = await mintUser("leg-google");
    const otp = await mintUser("leg-otp");

    // Leg 1 — a Google-shaped session (full_name present).
    const a1 = await seedAnonymousAssessment();
    expect((await claimAndBootstrapProfile(admin, { assessmentId: a1, user: google })).claimed).toBe(true);

    // Leg 2 — an email-OTP-shaped session carrying NO provider display name.
    const otpSession = { ...otp, user_metadata: {} };
    const a2 = await seedAnonymousAssessment();
    expect((await claimAndBootstrapProfile(admin, { assessmentId: a2, user: otpSession })).claimed).toBe(true);
    // …and it still yields a valid personal case with a non-empty display name.
    const otpCase = await resolvePersonalCaseId(otp.id, admin);
    expect(otpCase).not.toBeNull();
    const { data: otpCaseRow } = await admin.from("cases").select("display_name").eq("id", otpCase!).maybeSingle();
    expect(otpCaseRow!.display_name.length).toBeGreaterThan(0);
    expect(otpCaseRow!.display_name).not.toBe("undefined");

    // Leg 3 — a re-claim of the caller's own row.
    const reclaim = await claimAndBootstrapProfile(admin, { assessmentId: a2, user: otpSession });
    expect(reclaim.reason).toBe("already-mine");

    for (const id of [a1, a2]) {
      const row = await getAssessmentById(admin, id);
      expect(row?.claimed_at).not.toBeNull();
      expect(row?.owner).not.toBeNull();
    }

    // Corpus-level: ZERO claimed-but-owner-null rows exist anywhere. If this ever
    // fails, it is a FINDING for MV-160's sweep, not something to paper over.
    const { data: violations, error } = await admin
      .from("assessments")
      .select("id")
      .is("owner", null)
      .not("claimed_at", "is", null);
    if (error) throw new Error(error.message);
    expect(violations).toEqual([]);
  });
});
