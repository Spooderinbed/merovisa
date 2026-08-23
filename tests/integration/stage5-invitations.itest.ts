/**
 * MV-193 — Stage 5 slice 1: minting and revoking a student invitation, asserted against a
 * REAL database.
 *
 * Naming: `*.itest.ts` marks a real-DB integration test. It is excluded from the default
 * `npm test` (see vitest.config.ts) and only run by `npm run test:integration`
 * (vitest.integration.config.ts) — which is what CI's gating `integration` job runs
 * against a stack it hosts itself.
 *
 * Run locally:
 *   npx supabase start
 *   # from `npx supabase status -o env`:
 *   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<SERVICE_ROLE_KEY>"
 *   $env:SUPABASE_TEST_ANON_KEY = "<ANON_KEY>"
 *   npm run test:integration
 *
 * Skips cleanly (never fails) when those env vars are absent. LOCAL STACK ONLY. And NEVER
 * from `.claude/worktrees/` — `vitest.integration.config.ts` excludes `**​/.claude/**`, so a
 * run there collects ZERO tests and looks green.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 * `tests/cases/invitations-repo.test.ts` and `tests/api/invitation-routes.test.ts` prove the
 * APP layer: which claim each route asks for, which case id it forwards, which column the
 * repository writes, and how each failure is named. Neither can prove Postgres agrees, and
 * the app layer is explicitly NOT the tenant boundary (`lib/cases/README.md`) — RLS
 * evaluated as the authenticated user is. Delete every `checkCasePermission` call in this
 * slice and both of those suites go red; delete the three policies and they stay green.
 *
 * **AN RLS SUITE THAT ONLY ASSERTS DENIALS PASSES IDENTICALLY AGAINST A MISSING POLICY.**
 * A table with RLS forced and no policy at all denies everything — so "the outsider minted
 * nothing" is satisfied by a broken migration just as well as by a correct one. Every denial
 * below is therefore PAIRED with the positive case proving the policy admits the actor it is
 * supposed to admit, and every silent denial is paired with a service-role existence proof
 * so it cannot be satisfied by a fixture that never seeded.
 *
 * `supabase/rehearsal/MV-193-mutation.sql` is the other half of that argument: eight mutants
 * that WIDEN (never drop — a drop leaves every denial green), each naming the tests it must
 * turn red.
 *
 * EVERY ASSERTION RUNS AS `authenticated`. A probe issued on the service-role client
 * bypasses every policy and proves nothing; service-role appears here only to seed, to prove
 * a row exists so a silent denial is distinguishable from an absent fixture, to read a value
 * back, and to clean up.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ONE THIS CARD IS MOSTLY ABOUT
 * ---------------------------------------------------------------------------------------
 * Criterion 3 — the plaintext token is not recoverable from the database. The unit file
 * hunts it in what the repository SENDS; this file hunts it in what Postgres actually
 * STORED, by reading the committed row back with `select *` on the service-role client and
 * asserting no column of it carries the token. That is the strongest available statement of
 * the property: it is what a compromised backup would see.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// The repository and the token module are `import "server-only"`; in the node lane that
// marker package resolves to the entry that throws on import. The established repo idiom.
vi.mock("server-only", () => ({}));

import {
  assertLocalStack,
  seedTenancyFixture,
  type Actor,
  type ActorKey,
  type TenancyFixture,
} from "./fixtures/tenancy";
import {
  createStudentInvitation,
  listCaseInvitations,
  revokeCaseInvitation,
} from "@/lib/cases/invitations-repo";
import { hashInvitationToken } from "@/lib/invitations/token";

const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

assertLocalStack("stage5-invitations.itest.ts", url);

const TABLE = "invitations";

describe.skipIf(!url || !serviceKey || !anonKey)("MV-193 Stage 5 student invitations", () => {
  let fixture: TenancyFixture;

  /** Organization A, `counsellorAssignedA` is its primary counsellor. */
  let caseA: string;
  /** Organization A, nobody assigned — the admin's reach without a counsellor's. */
  let caseUnassignedA: string;
  /** Organization B's case. `counsellorAssignedA` holds no membership there at all. */
  let caseB: string;
  /** A personal case — `organization_id IS NULL`. No consultancy invitation can live on one. */
  let personalCase: string;

  const actor = (key: ActorKey): Actor => fixture.actors[key];

  /**
   * Wipe every invitation on this file's cases, through the service role.
   *
   * Runs before EACH test rather than once, and that is load-bearing for criterion 7: the
   * fixture itself seeds an outstanding `student-a` invitation on `orgAssignedA` (so the
   * cross-tenant READ denials in `tenant-isolation.itest.ts` have something real to deny),
   * and a mint against a case that already has one is refused by design. Starting every
   * test from a known-empty case is what keeps the tests order-independent.
   */
  const clearInvitations = async (): Promise<void> => {
    const { error } = await fixture.admin
      .from(TABLE)
      .delete()
      .in("case_id", [caseA, caseUnassignedA, caseB, personalCase]);
    if (error) throw new Error(`HARNESS DEFECT: could not clear invitations: ${error.message}`);
  };

  /** Every column of one row, as the service role sees it — i.e. as a backup would. */
  const rawRow = async (id: string): Promise<Record<string, unknown>> => {
    const { data, error } = await fixture.admin.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) throw new Error(`HARNESS DEFECT: could not read row ${id}: ${error?.message}`);
    return data as unknown as Record<string, unknown>;
  };

  /** How many invitations exist on a case, service-role — the existence proof behind a denial. */
  const countOn = async (caseId: string): Promise<number> => {
    const { count, error } = await fixture.admin
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId);
    if (error) throw new Error(`HARNESS DEFECT: could not count invitations: ${error.message}`);
    return count ?? 0;
  };

  beforeAll(async () => {
    fixture = await seedTenancyFixture({ url: url!, serviceKey: serviceKey!, anonKey: anonKey! });
    caseA = fixture.cases.orgAssignedA;
    caseUnassignedA = fixture.cases.orgUnassignedA;
    caseB = fixture.cases.orgAssignedB;
    personalCase = fixture.cases.personalA;
  }, 60_000);

  beforeEach(async () => {
    await clearInvitations();
  });

  afterAll(async () => {
    if (fixture) await fixture.teardown();
  });

  // =====================================================================================
  // The harness can express what it is testing
  // =====================================================================================
  describe("controls — the fixture is real and the clients are RLS-scoped", () => {
    it("seeds two organizations and four cases in the shapes the denials need", () => {
      expect(fixture.orgA).not.toBe(fixture.orgB);
      expect(fixture.caseOrg.orgAssignedA).toBe(fixture.orgA);
      expect(fixture.caseOrg.orgAssignedB).toBe(fixture.orgB);
      // The personal case is what makes "not-an-org-case" a real state rather than a branch
      // nothing reaches.
      expect(fixture.caseOrg.personalA).toBeNull();
    });

    it("starts each test with no invitation on this file's cases", async () => {
      // If this were false, every "refused" below could be the outstanding-check refusing
      // rather than the policy — a green suite measuring the wrong sentence.
      expect(await countOn(caseA)).toBe(0);
      expect(await countOn(caseB)).toBe(0);
    });
  });

  // =====================================================================================
  // Criterion 1 — who may mint. Every denial paired with the control that admits somebody.
  // =====================================================================================
  describe("criterion 1 — a counsellor assigned to the case may mint, and only the right people may", () => {
    it("CONTROL: the ASSIGNED counsellor mints on their own case", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-assigned-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(result.ok, `assigned counsellor refused: ${(result as { reason?: string }).reason}`).toBe(true);
      expect(await countOn(caseA)).toBe(1);
    });

    it("CONTROL: an org ADMIN mints on a case nobody is assigned to", async () => {
      // `case.invite_student` is `all-org` for owner/admin and `assigned` for a counsellor,
      // and `private.can_staff_case`'s admin arm is the database saying the same thing.
      const result = await createStudentInvitation(
        actor("adminA").id,
        caseUnassignedA,
        `mv193-admin-${fixture.stamp}@example.test`,
        actor("adminA").client,
      );

      expect(result.ok, `admin refused: ${(result as { reason?: string }).reason}`).toBe(true);
    });

    it("CONTROL: the OWNER mints too", async () => {
      const result = await createStudentInvitation(
        actor("ownerA").id,
        caseUnassignedA,
        `mv193-owner-${fixture.stamp}@example.test`,
        actor("ownerA").client,
      );

      expect(result.ok).toBe(true);
    });

    it("REFUSES an UNASSIGNED counsellor of the same tenant, and nothing lands", async () => {
      // The narrow, realistic bug: a policy widened from "assigned to this case" to "any
      // member of the tenant". Org B and the outsider stay refused under that widening, so
      // this actor is the one that measures the CASE bound rather than the tenant bound.
      const result = await createStudentInvitation(
        actor("counsellorUnassignedA").id,
        caseA,
        `mv193-unassigned-${fixture.stamp}@example.test`,
        actor("counsellorUnassignedA").client,
      );

      expect(result.ok).toBe(false);
      expect(await countOn(caseA)).toBe(0);
      // THE LAYER THAT REFUSED, named — and this assertion is the whole reason the block
      // below exists. `createStudentInvitation` reads the case FIRST, on the actor's own
      // RLS client, and `cases_select_accessor` admits only the student, an org ADMIN, or
      // an ASSIGNED counsellor. So this actor never reaches `invitations_insert_staff` at
      // all: the refusal is row INVISIBILITY, reported as `unknown-case`.
      //
      // MEASURED (MV-193 mutation run): widening the invitations INSERT policy to admit any
      // tenant member leaves this test GREEN, because the case read still refuses. Two
      // independent layers, neither load-bearing alone — the same shape MV-191 found on the
      // download verb. Pinning the REASON is what keeps that visible instead of letting a
      // bare `ok === false` hide which layer is doing the work.
      expect((result as { reason?: string }).reason).toBe("unknown-case");
    });

    it("REFUSES a counsellor from ANOTHER organization, and nothing lands", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedB").id,
        caseA,
        `mv193-crosstenant-${fixture.stamp}@example.test`,
        actor("counsellorAssignedB").client,
      );

      expect(result.ok).toBe(false);
      expect(await countOn(caseA)).toBe(0);
    });

    it("CONTROL for that denial: the SAME org B counsellor mints fine on their OWN case", async () => {
      // Without this the denial above is satisfied by a broken client just as well as by a
      // working policy.
      const result = await createStudentInvitation(
        actor("counsellorAssignedB").id,
        caseB,
        `mv193-ownb-${fixture.stamp}@example.test`,
        actor("counsellorAssignedB").client,
      );

      expect(result.ok, `org B counsellor refused on their own case`).toBe(true);
      expect(await countOn(caseB)).toBe(1);
    });

    it("REFUSES an outsider with no membership anywhere", async () => {
      const result = await createStudentInvitation(
        actor("outsider").id,
        caseA,
        `mv193-outsider-${fixture.stamp}@example.test`,
        actor("outsider").client,
      );

      expect(result.ok).toBe(false);
      expect(await countOn(caseA)).toBe(0);
    });

    it("REFUSES the LINKED STUDENT of the case — they hold case.read, and this claim not at all", async () => {
      const result = await createStudentInvitation(
        actor("studentA").id,
        caseA,
        `mv193-student-${fixture.stamp}@example.test`,
        actor("studentA").client,
      );

      expect(result.ok).toBe(false);
      expect(await countOn(caseA)).toBe(0);
    });

    it("REFUSES an ANONYMOUS caller — anon holds no grant on invitations at all", async () => {
      // Not a policy refusal: `anon` holds no table privilege, so this is a 42501 raised by
      // the GRANT surface before any policy is consulted. Recorded plainly because the two
      // are different guarantees.
      const { error } = await fixture.anon
        .from(TABLE)
        .insert({
          case_id: caseA,
          organization_id: fixture.orgA,
          email: `mv193-anon-${fixture.stamp}@example.test`,
          role: "student",
          token_hash: `mv193-anon-${fixture.stamp}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never);

      expect(error).not.toBeNull();
      expect(await countOn(caseA)).toBe(0);
    });

    it("a counsellor cannot even SEE a personal case, so a mint against one is unknown-case", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        personalCase,
        `mv193-personal-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      // The honest answer, and not an existence oracle: the `cases` read is RLS-scoped, so
      // a case the actor cannot see resolves to "no such case" rather than "forbidden".
      expect(result).toEqual({ ok: false, reason: "unknown-case" });
    });
  });

  // =====================================================================================
  // The INSERT policy on its own, with the `cases` read taken out of the way
  // =====================================================================================
  describe("invitations_insert_staff, measured WITHOUT the case read in front of it", () => {
    /**
     * WHY THIS BLOCK EXISTS, and it is the most interesting result in this file.
     *
     * `createStudentInvitation` reads the case before it writes, on the actor's own RLS
     * client — so for any actor `cases_select_accessor` hides the case from, the repository
     * returns `unknown-case` and `invitations_insert_staff` is NEVER CONSULTED. Measured:
     * widening the invitations INSERT policy to admit every member of the tenant left the
     * whole suite at 39/39 green, because the case read refused first.
     *
     * That is a genuine two-layer defence and worth having — but a suite that only ever
     * probes through the repository cannot see the second layer, and a future author who
     * removed it would watch every test stay green and conclude it was redundant. It is
     * not: it is the half that holds if the case read is ever widened (an org-wide `cases`
     * SELECT is a plausible product change), and it is the ONLY layer for an actor who CAN
     * see the case but must not invite on it.
     *
     * So these probes go straight at the table, supplying the `organization_id` the actor
     * could not have read — which is exactly what an attacker with a case id would do, and
     * exactly what `private.can_staff_case` (SECURITY DEFINER, answering regardless of row
     * visibility) exists to refuse.
     */
    const directInsert = async (key: ActorKey, caseId: string, organizationId: string | null) =>
      actor(key)
        .client.from(TABLE)
        .insert({
          case_id: caseId,
          organization_id: organizationId,
          email: `mv193-direct-${key}-${fixture.stamp}@example.test`,
          role: "student",
          token_hash: `mv193-direct-${key}-${fixture.stamp}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never);

    it("CONTROL: the ASSIGNED counsellor's direct insert lands", async () => {
      const { error } = await directInsert("counsellorAssignedA", caseA, fixture.orgA);

      expect(error).toBeNull();
      expect(await countOn(caseA)).toBe(1);
    });

    it("CONTROL: the org ADMIN's direct insert lands", async () => {
      const { error } = await directInsert("adminA", caseA, fixture.orgA);

      expect(error).toBeNull();
      expect(await countOn(caseA)).toBe(1);
    });

    it("REFUSES the UNASSIGNED counsellor's direct insert — can_staff_case, not row visibility", async () => {
      const { error } = await directInsert("counsellorUnassignedA", caseA, fixture.orgA);

      expect(error).not.toBeNull();
      expect(await countOn(caseA)).toBe(0);
    });

    it("REFUSES a counsellor from ANOTHER organization", async () => {
      const { error } = await directInsert("counsellorAssignedB", caseA, fixture.orgA);

      expect(error).not.toBeNull();
      expect(await countOn(caseA)).toBe(0);
    });

    it("REFUSES an outsider with no membership anywhere", async () => {
      const { error } = await directInsert("outsider", caseA, fixture.orgA);

      expect(error).not.toBeNull();
      expect(await countOn(caseA)).toBe(0);
    });

    it("REFUSES the LINKED STUDENT — who CAN see this case, so the policy is the only layer", async () => {
      // The student passes `cases_select_accessor` on their own case, so for THEM the case
      // read is no defence at all and `invitations_insert_staff` is the whole of it.
      const { error } = await directInsert("studentA", caseA, fixture.orgA);

      expect(error).not.toBeNull();
      expect(await countOn(caseA)).toBe(0);
    });

    it("REFUSES a TEAM invitation minted by a counsellor — a different authority entirely", async () => {
      // The team branch requires `actor_admin_org_ids()`. A counsellor who could mint a
      // team invitation would be putting a colleague into the organization, which is a
      // different blast radius and is out of this slice by name.
      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .insert({
          organization_id: fixture.orgA,
          case_id: null,
          email: `mv193-team-${fixture.stamp}@example.test`,
          role: "counsellor",
          token_hash: `mv193-team-${fixture.stamp}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never);

      expect(error).not.toBeNull();
    });
  });

  // =====================================================================================
  // Criterion 2 — exactly one row, and what is in it
  // =====================================================================================
  describe("criterion 2 — the row that lands", () => {
    it("creates EXACTLY ONE row, with role=student, the case, its org, and the real actor", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-row-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(await countOn(caseA)).toBe(1);

      const row = await rawRow(result.id);
      expect(row.role).toBe("student");
      expect(row.case_id).toBe(caseA);
      expect(row.organization_id).toBe(fixture.orgA);
      expect(row.invited_by).toBe(actor("counsellorAssignedA").id);
      expect(row.accepted_at).toBeNull();
      expect(row.revoked_at).toBeNull();
    });

    it("sets expires_at in the FUTURE — criterion 5, measured against the database's own clock", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-expiry-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await rawRow(result.id);
      expect(new Date(row.expires_at as string).getTime()).toBeGreaterThan(Date.now());
    });

    it("cannot be stamped with ANOTHER tenant's organization — the policy's org tie holds", async () => {
      // `invitations_insert_staff`'s last conjunct is
      // `NOT (organization_id IS DISTINCT FROM private.case_org_id(case_id))`. Without it,
      // `invitations_shape_check` leaves organization_id unconstrained on a case invite, so
      // a student invite could carry org B's id — and `invitations_select_staff`'s FIRST
      // branch would then show the row, and the student's email, to org B's admins.
      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .insert({
          case_id: caseA,
          organization_id: fixture.orgB,
          email: `mv193-orgtie-${fixture.stamp}@example.test`,
          role: "student",
          token_hash: `mv193-orgtie-${fixture.stamp}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never);

      expect(error).not.toBeNull();
      expect(await countOn(caseA)).toBe(0);
    });

    it("CONTROL for that tie: the SAME insert with the case's OWN org lands", async () => {
      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .insert({
          case_id: caseA,
          organization_id: fixture.orgA,
          email: `mv193-orgtie-ok-${fixture.stamp}@example.test`,
          role: "student",
          token_hash: `mv193-orgtie-ok-${fixture.stamp}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never);

      expect(error).toBeNull();
      expect(await countOn(caseA)).toBe(1);
    });
  });

  // =====================================================================================
  // Criterion 3 and 4 — the token, against what Postgres actually stored
  // =====================================================================================
  describe("criteria 3 and 4 — the plaintext token is not recoverable from the database", () => {
    it("the STORED token_hash is not the token, and is its SHA-256 digest", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-secret-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await rawRow(result.id);
      expect(row.token_hash).not.toBe(result.token);
      // Deterministic, which is what lets slice 2 look an invitation up by the token the
      // student presents without the database ever having held the token.
      expect(row.token_hash).toBe(hashInvitationToken(result.token));
    });

    it("NO COLUMN of the committed row carries the token — what a compromised backup would see", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-backup-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await rawRow(result.id);
      // The control: `select *` really did return the whole row. A read that returned two
      // columns would satisfy the loop below against a row that stored the token in a third.
      expect(Object.keys(row).length).toBeGreaterThanOrEqual(10);
      for (const [column, value] of Object.entries(row)) {
        expect(String(value), `column \`${column}\` carries the plaintext token`).not.toContain(
          result.token,
        );
      }
    });

    it("criterion 4 — re-reading through the product's read path returns no token", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-reread-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const listed = await listCaseInvitations(caseA, actor("counsellorAssignedA").client);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(1);
      expect(JSON.stringify(listed.data)).not.toContain(result.token);
      // And not the digest either — the counsellor's browser has no use for it.
      const row = await rawRow(result.id);
      expect(JSON.stringify(listed.data)).not.toContain(row.token_hash as string);
    });

    it("two mints on the same case produce different tokens and different digests", async () => {
      const first = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-a-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      // Criterion 7 refuses a second while one is outstanding, so the first is revoked.
      await revokeCaseInvitation(first.id, caseA, actor("counsellorAssignedA").client);

      const second = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-b-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(second.token).not.toBe(first.token);
      // `token_hash` is `not null UNIQUE`, so a repeated token would be a 23505 rather than
      // a silent collision — but a generator seeded once per process would produce exactly
      // that, and this is what notices.
      expect((await rawRow(second.id)).token_hash).not.toBe((await rawRow(first.id)).token_hash);
    });
  });

  // =====================================================================================
  // Criterion 6 — revocation
  // =====================================================================================
  describe("criterion 6 — revoking", () => {
    const mint = async (): Promise<string> => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-revoke-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      if (!result.ok) throw new Error(`HARNESS DEFECT: could not mint: ${result.reason}`);
      return result.id;
    };

    it("CONTROL: the counsellor who could have minted it can revoke it", async () => {
      const id = await mint();

      const result = await revokeCaseInvitation(id, caseA, actor("counsellorAssignedA").client);

      expect(result).toEqual({ ok: true });
      expect((await rawRow(id)).revoked_at).not.toBeNull();
    });

    it("the row SURVIVES — revocation is a stamp, never a delete", async () => {
      const id = await mint();

      await revokeCaseInvitation(id, caseA, actor("counsellorAssignedA").client);

      // MV-152 shipped no DELETE policy on `invitations`: "a deleted invitation is a deleted
      // record of who was invited."
      expect(await countOn(caseA)).toBe(1);
      expect((await rawRow(id)).id).toBe(id);
    });

    it("REFUSES an unassigned counsellor of the same tenant, and the row stays live", async () => {
      const id = await mint();

      const result = await revokeCaseInvitation(id, caseA, actor("counsellorUnassignedA").client);

      expect(result.ok).toBe(false);
      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("REFUSES a counsellor from another organization, and the row stays live", async () => {
      const id = await mint();

      const result = await revokeCaseInvitation(id, caseA, actor("counsellorAssignedB").client);

      expect(result.ok).toBe(false);
      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("REFUSES the linked student, and the row stays live", async () => {
      const id = await mint();

      const result = await revokeCaseInvitation(id, caseA, actor("studentA").client);

      expect(result.ok).toBe(false);
      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("REFUSES an anonymous caller — anon holds no UPDATE grant either", async () => {
      const id = await mint();

      const { error } = await fixture.anon
        .from(TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);

      expect(error).not.toBeNull();
      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("cannot DELETE an invitation, even as the counsellor who minted it", async () => {
      const id = await mint();

      const { error } = await actor("counsellorAssignedA").client.from(TABLE).delete().eq("id", id);

      // No DELETE grant and no DELETE policy. Either way the row must still be there —
      // a `42501` and a policy refusal are both acceptable, a missing row is not.
      expect(await countOn(caseA)).toBe(1);
      if (error === null) {
        // A refusal reported as zero rows rather than an error is still a refusal.
        expect((await rawRow(id)).id).toBe(id);
      }
    });
  });

  // =====================================================================================
  // The UPDATE policy on its own, with the repository's read-back taken out of the way
  // =====================================================================================
  describe("invitations_update_staff, measured WITHOUT the repository's .select() in front of it", () => {
    /**
     * The same shape of finding as the insert block above, one verb along.
     *
     * `revokeCaseInvitation` chains `.select("id")` onto its UPDATE — deliberately, because a
     * policy refusal is not an error and zero-rows is the only way to tell a refused revoke
     * from a successful one. But `RETURNING` is governed by the SELECT policy, so an actor the
     * SELECT policy hides the row from reads zero rows *whatever the UPDATE policy says* — and
     * the repository reports `denied` either way.
     *
     * MEASURED: widening ONLY `invitations_update_staff` to admit any tenant member left the
     * whole suite green. Two independent layers again, and a suite that only probes through the
     * repository cannot tell which one refused.
     *
     * These probes therefore issue the UPDATE with NO `.select()` and check what actually landed
     * with the service role. That is the question the policy is really being asked.
     */
    const mintFor = async (): Promise<string> => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-directrevoke-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      if (!result.ok) throw new Error(`HARNESS DEFECT: could not mint: ${result.reason}`);
      return result.id;
    };

    const directRevoke = (key: ActorKey, id: string) =>
      actor(key)
        .client.from(TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);

    it("CONTROL: the assigned counsellor's direct revoke LANDS", async () => {
      const id = await mintFor();

      await directRevoke("counsellorAssignedA", id);

      expect((await rawRow(id)).revoked_at).not.toBeNull();
    });

    it("CONTROL: the org admin's direct revoke lands", async () => {
      const id = await mintFor();

      await directRevoke("adminA", id);

      expect((await rawRow(id)).revoked_at).not.toBeNull();
    });

    it("the UNASSIGNED counsellor's direct revoke does not land", async () => {
      const id = await mintFor();

      await directRevoke("counsellorUnassignedA", id);

      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("the org B counsellor's direct revoke does not land", async () => {
      const id = await mintFor();

      await directRevoke("counsellorAssignedB", id);

      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("the LINKED STUDENT's direct revoke does not land — the policy is their only layer", async () => {
      const id = await mintFor();

      await directRevoke("studentA", id);

      expect((await rawRow(id)).revoked_at).toBeNull();
    });

    it("nobody can UN-revoke by writing revoked_at back to null", async () => {
      const id = await mintFor();
      await directRevoke("counsellorAssignedA", id);
      expect((await rawRow(id)).revoked_at).not.toBeNull();

      // The `revoked_at` grant is BIDIRECTIONAL at the database — writing null un-revokes,
      // which is why MV-152's UPDATE policy carries the owner carve-out. For a STUDENT
      // invitation the predicate is `can_staff_case`, so an unassigned colleague cannot
      // resurrect a link a counsellor killed.
      await actor("counsellorUnassignedA").client.from(TABLE).update({ revoked_at: null }).eq("id", id);

      expect((await rawRow(id)).revoked_at).not.toBeNull();
    });
  });

  // =====================================================================================
  // Criterion 7 — no silent duplicate
  // =====================================================================================
  describe("criterion 7 — a second invitation while one is outstanding", () => {
    it("is REFUSED, and no second row is created", async () => {
      const first = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-dup1-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(first.ok).toBe(true);

      const second = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-dup2-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(second).toEqual({ ok: false, reason: "already-outstanding" });
      expect(await countOn(caseA)).toBe(1);
    });

    it("CONTROL: once the first is revoked, a second mint succeeds", async () => {
      const first = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-dup3-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await revokeCaseInvitation(first.id, caseA, actor("counsellorAssignedA").client);

      const second = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-dup4-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      expect(second.ok).toBe(true);
      // Both rows survive: the revoked one is still the record of who was invited.
      expect(await countOn(caseA)).toBe(2);
    });
  });

  // =====================================================================================
  // The grant surface this slice must NOT widen
  // =====================================================================================
  describe("criterion 8 — the grant surface is exactly what MV-152 shipped", () => {
    it("`accepted_at` is NOT writable by an authenticated client — acceptance stays server-only", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-accept-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", result.id);

      // The column is outside `grant update (revoked_at)`, so this is a PLAN-TIME 42501 —
      // refused before any policy is consulted, and unexpressible rather than merely denied.
      // This is what keeps slice 2's acceptance a server-side compare-and-swap.
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
      expect((await rawRow(result.id)).accepted_at).toBeNull();
    });

    it("CONTROL for that refusal: the SAME client CAN write `revoked_at`", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-revokable-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Without this the 42501 above is satisfied by a client that cannot write ANYTHING —
      // a broken session would pass it just as well as a correct grant.
      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", result.id);

      expect(error).toBeNull();
      expect((await rawRow(result.id)).revoked_at).not.toBeNull();
    });

    it("`token_hash` is not writable either — a counsellor cannot re-point an invitation", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-rehash-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const before = (await rawRow(result.id)).token_hash;

      const { error } = await actor("counsellorAssignedA")
        .client.from(TABLE)
        .update({ token_hash: hashInvitationToken("a token of my own choosing") })
        .eq("id", result.id);

      // `update (revoked_at)` is the whole column grant. Were `token_hash` writable, anyone
      // who could revoke could instead swap in a digest of a token THEY hold and walk in as
      // the student.
      expect(error).not.toBeNull();
      expect((await rawRow(result.id)).token_hash).toBe(before);
    });

    it("an ANONYMOUS caller reads nothing from invitations, with a row there to be read", async () => {
      const result = await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-anonread-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(result.ok).toBe(true);
      // The existence proof: without it, "anon saw nothing" is satisfied by an empty table.
      expect(await countOn(caseA)).toBe(1);

      const { data, error } = await fixture.anon.from(TABLE).select("id, email, token_hash");

      // Either a refusal or an empty result is acceptable; a row is not.
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  });

  // =====================================================================================
  // The read boundary
  // =====================================================================================
  describe("who may SEE a case's invitations", () => {
    it("CONTROL: the assigned counsellor sees the invitation on their case", async () => {
      await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-see-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      const listed = await listCaseInvitations(caseA, actor("counsellorAssignedA").client);

      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(1);
    });

    it("an UNASSIGNED counsellor of the same tenant learns NOTHING, with a row there to learn", async () => {
      await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-hidden-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(await countOn(caseA)).toBe(1);

      const listed = await listCaseInvitations(caseA, actor("counsellorUnassignedA").client);

      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(0);
    });

    it("a counsellor from ANOTHER organization learns nothing", async () => {
      await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-crossread-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(await countOn(caseA)).toBe(1);

      const listed = await listCaseInvitations(caseA, actor("counsellorAssignedB").client);

      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(0);
    });

    it("CONTROL for that denial: the same org B counsellor DOES see their own case's invitation", async () => {
      await createStudentInvitation(
        actor("counsellorAssignedB").id,
        caseB,
        `mv193-bread-${fixture.stamp}@example.test`,
        actor("counsellorAssignedB").client,
      );

      const listed = await listCaseInvitations(caseB, actor("counsellorAssignedB").client);

      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(1);
    });

    it("the org ADMIN sees it — the first branch of invitations_select_staff", async () => {
      await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-adminread-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );

      const listed = await listCaseInvitations(caseA, actor("adminA").client);

      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(1);
    });

    it("the LINKED STUDENT does not see the invitation on their own case", async () => {
      await createStudentInvitation(
        actor("counsellorAssignedA").id,
        caseA,
        `mv193-studentread-${fixture.stamp}@example.test`,
        actor("counsellorAssignedA").client,
      );
      expect(await countOn(caseA)).toBe(1);

      const listed = await listCaseInvitations(caseA, actor("studentA").client);

      // `invitations_select_staff` has no student branch: both disjuncts are staff
      // predicates. A student's own invitation is consultancy correspondence about them.
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.data).toHaveLength(0);
    });
  });
});
