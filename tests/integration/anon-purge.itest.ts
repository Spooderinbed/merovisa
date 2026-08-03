/**
 * MV-135 — Real-DB anonymous-purge integration smoke.
 *
 * Drives `purgeUnclaimedAnonymousAssessments` against a REAL local Postgres with the
 * real migrations applied, so it proves the things a mocked supabase-js client
 * structurally cannot:
 *
 *  - the `leads_assessment_id_fkey` ON DELETE CASCADE actually fires, so a captured
 *    email really does die with its assessment (the app issues a DELETE against
 *    `assessments` only — the cascade is invisible at the call site, and a surviving
 *    email pointing at a destroyed assessment is the worst outcome available here);
 *  - a CLAIMED assessment with a long-past `expires_at` survives — the landmine, since
 *    a claim never extends the expiry, so a converted user's row looks exactly as
 *    expired as an abandoned one;
 *  - a purged assessment cannot be resurrected: claiming it afterwards fails and
 *    bootstraps nothing.
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

import { purgeUnclaimedAnonymousAssessments, ANON_RETENTION_DAYS } from "@/lib/assessments/purge";
import { claimAndBootstrapProfile } from "@/lib/assessments/claim";
import { createAnonymousAssessment, createLead } from "@/lib/assessments/repo";
import { getProfileForCase } from "@/lib/profiles/repo";
import type { Database } from "@/lib/supabase/types";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * HARD localhost guard — not a comment, a gate.
 *
 * The sibling claim-path smoke only ever writes rows it created and removes them by id, so
 * pointed at the wrong project it would litter. This file is categorically more dangerous:
 * `purgeUnclaimedAnonymousAssessments` takes no id filter, so it deletes EVERY overdue
 * unclaimed row in whatever database it is handed, cascading each row's captured email away
 * with it. A stale SUPABASE_TEST_URL in a shell — copied from Vercel, or left over from a
 * data check — would destroy real student data. Refuse to run anywhere but a local stack.
 */
const isLocalStack = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const { hostname } = new URL(u);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
};

if (url && !isLocalStack(url)) {
  throw new Error(
    `anon-purge.itest.ts refuses to run against a non-local database (SUPABASE_TEST_URL=${url}). ` +
      "This suite issues an unscoped DELETE. Point it at a local `npx supabase start` stack, or unset the variable.",
  );
}

describe.skipIf(!url || !serviceKey)("anonymous purge against a real local Postgres", () => {
  let admin: SupabaseClient<Database>;
  let userId: string;
  // Unique per run so a failed teardown never collides with the next run.
  const email = `mv135-purge-smoke-${Date.now()}@example.test`;
  const seededAssessmentIds: string[] = [];

  /** Seed an anonymous row, then backdate created_at so it is genuinely overdue. */
  const seedAnonymous = async (ageDays: number): Promise<string> => {
    const createdAt = new Date(Date.now() - ageDays * MS_PER_DAY);
    const id = await createAnonymousAssessment(admin, {
      profileSnapshot: { destination: "australia" },
      destinationId: "australia",
      result: { verdict: "possible" },
      ruleVersion: "v0.5.0-itest",
      expiresAt: new Date(createdAt.getTime() + 3 * MS_PER_DAY).toISOString(),
    });
    if (!id) throw new Error("failed to seed anonymous assessment");
    seededAssessmentIds.push(id);
    // created_at defaults to now(); the purge gates on it, so it must be backdated.
    const { error } = await admin
      .from("assessments")
      .update({ created_at: createdAt.toISOString() })
      .eq("id", id);
    if (error) throw new Error(`failed to backdate created_at: ${error.message}`);
    return id;
  };

  const exists = async (id: string): Promise<boolean> => {
    const { data, error } = await admin.from("assessments").select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  };

  const leadCount = async (assessmentId: string): Promise<number> => {
    const { data, error } = await admin.from("leads").select("id").eq("assessment_id", assessmentId);
    if (error) throw new Error(error.message);
    return (data ?? []).length;
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
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("destroys an overdue unclaimed assessment and cascades its captured email away", async () => {
    const doomed = await seedAnonymous(ANON_RETENTION_DAYS + 1);
    await createLead(admin, { email: `lead-${Date.now()}@example.test`, assessmentId: doomed });
    expect(await leadCount(doomed)).toBe(1);

    const report = await purgeUnclaimedAnonymousAssessments(admin);

    expect(report.failedSteps).toEqual([]);
    // Assert on THIS row, not on the run's total: the purge is global, so any other
    // seeded data in the same local database moves the count around.
    expect(await exists(doomed)).toBe(false);
    // The DELETE went to `assessments` only — this asserts the FK cascade, not the app.
    expect(await leadCount(doomed)).toBe(0);
  });

  it("keeps an unclaimed assessment that is still within its window", async () => {
    const fresh = await seedAnonymous(0);
    await purgeUnclaimedAnonymousAssessments(admin);
    expect(await exists(fresh)).toBe(true);
  });

  // THE LANDMINE: a claim updates only { owner, claimed_at } and never extends
  // expires_at, so this row is indistinguishable from an abandoned one on time alone.
  it("keeps a CLAIMED assessment whose expiry is long past", async () => {
    const claimed = await seedAnonymous(0);
    const { claimed: ok } = await claimAndBootstrapProfile(admin, { assessmentId: claimed, userId, email });
    expect(ok).toBe(true);
    // Backdate it past every purge threshold — only `owner is null` can save it now.
    const longAgo = new Date(Date.now() - (ANON_RETENTION_DAYS + 365) * MS_PER_DAY).toISOString();
    const { error } = await admin
      .from("assessments")
      .update({ created_at: longAgo, expires_at: longAgo })
      .eq("id", claimed);
    if (error) throw new Error(error.message);

    await purgeUnclaimedAnonymousAssessments(admin);

    expect(await exists(claimed)).toBe(true);
  });

  it("cannot be resurrected: claiming a purged assessment fails and bootstraps nothing", async () => {
    const doomed = await seedAnonymous(ANON_RETENTION_DAYS + 1);
    await purgeUnclaimedAnonymousAssessments(admin);
    expect(await exists(doomed)).toBe(false);

    const { data: fresh } = await admin.auth.admin.createUser({
      email: `mv135-resurrect-${Date.now()}@example.test`,
      email_confirm: true,
    });
    const freshUserId = fresh.user!.id;
    try {
      const result = await claimAndBootstrapProfile(admin, {
        assessmentId: doomed,
        userId: freshUserId,
        googleName: "Ghost Claimant",
        email,
      });
      // MV-130 enriched the miss with a classification; a purged row must read
      // as expired — the honest "deleted, not recoverable" signal, never a retry.
      expect(result).toEqual({ claimed: false, reason: "expired" });
      // A failed claim must not leave a half-bootstrapped account behind.
      expect(await getProfileForCase(admin, freshUserId)).toBeNull();
      expect(await exists(doomed)).toBe(false);
    } finally {
      await admin.auth.admin.deleteUser(freshUserId);
    }
  });
});
