/**
 * MV-18 — Real-DB claim-path integration smoke.
 *
 * Drives `claimAndBootstrapProfile` against a REAL local Postgres with the real
 * migrations applied (incl. the partial-unique index `assessments_primary_idx`),
 * so it catches the class of bug the mocked unit tests structurally cannot: a real
 * DB constraint rejecting a write that a supabase-js mock would happily "accept"
 * (the swallowed-index failure behind the MV-16 dashboard-pinning regression).
 *
 * The claim layer is auth-method-agnostic — it operates on a `userId`, not a Google
 * session — so we mint a throwaway user via `auth.admin.createUser`, no OAuth
 * round-trip required. Only `exchangeCodeForSession` is Google-specific and stays a
 * founder live-smoke.
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
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

describe.skipIf(!url || !serviceKey)("claim path against a real local Postgres", () => {
  let admin: SupabaseClient<Database>;
  let userId: string;
  // Unique per run so a failed teardown never collides with the next run.
  const email = `mv18-claim-smoke-${Date.now()}@example.test`;
  const seededAssessmentIds: string[] = [];

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

  beforeAll(async () => {
    admin = createClient<Database>(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new Error(`failed to mint test user: ${error?.message}`);
    userId = data.user.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (seededAssessmentIds.length) {
      await admin.from("assessments").delete().in("id", seededAssessmentIds);
    }
    // Deleting the auth user cascades to its owned assessments, profile, and leads.
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("a second claim becomes primary and demotes the first (newest-wins)", async () => {
    const a1 = await seedAnonymousAssessment();
    const a2 = await seedAnonymousAssessment();

    const r1 = await claimAndBootstrapProfile(admin, {
      assessmentId: a1,
      userId,
      googleName: "Test One",
      email,
    });
    expect(r1.claimed).toBe(true);
    expect((await getPrimaryAssessmentForCase(admin, userId))?.id).toBe(a1);

    const r2 = await claimAndBootstrapProfile(admin, { assessmentId: a2, userId, email });
    expect(r2.claimed).toBe(true);

    // Exactly one primary, and it is the newest (a2). This is the assertion that
    // goes RED against the pre-MV-16 single-promote code: the second promote trips
    // assessments_primary_idx, the error is swallowed, and a1 stays primary.
    expect(await primaryIdsForOwner()).toEqual([a2]);
    expect((await getAssessmentById(admin, a1))?.is_primary).toBe(false);
  });

  it("a successful claim records a lead and bootstraps a profile; a re-claim does not duplicate", async () => {
    const a = await seedAnonymousAssessment();

    const r = await claimAndBootstrapProfile(admin, {
      assessmentId: a,
      userId,
      googleName: "Test Two",
      email,
    });
    expect(r.claimed).toBe(true);

    const lead = await admin.from("leads").select("id").eq("assessment_id", a).eq("email", email);
    expect(lead.data?.length).toBe(1);

    const profile = await admin.from("profiles").select("owner").eq("owner", userId).maybeSingle();
    expect(profile.data?.owner).toBe(userId);

    // Re-claiming an already-owned assessment short-circuits (owner is no longer
    // null), so no second lead is even attempted — still exactly one.
    const reclaim = await claimAndBootstrapProfile(admin, { assessmentId: a, userId, email });
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
});
