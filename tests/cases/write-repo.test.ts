import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOrgCase,
  setCaseOperationalStatus,
  readOrgCase,
  readPrimaryCounsellor,
  assignPrimaryCounsellor,
  PRIMARY_COUNSELLOR_ROLE,
} from "@/lib/cases/write-repo";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * The data half of access-matrix cells 8, 9 and 10 — creating a case, handing it
 * to one primary counsellor, and moving its `operational_status`.
 *
 * These run against an in-memory fake and prove this layer's SEMANTICS: what it
 * asks the database for, and what it does with the answer. They are
 * *categorically incapable* of proving the database refuses a counsellor's
 * INSERT (`lib/cases/README.md` §"The SQL half is not optional"). That half is
 * `cases_insert_admin` / `case_assignments_insert_admin` / the
 * `cases_write_surface_guard` trigger, and it is pinned by
 * `tests/integration/case-rls.itest.ts:789-1046` — which this slice does not
 * touch, and which F-1's decision leaves exactly as it is.
 *
 * THE THREE VACUITY TRAPS these fixtures are shaped to avoid:
 *
 * 1. **A one-row assignment fixture cannot tell "replaced" from "inserted".**
 *    Every reassignment test seeds a case that ALREADY holds a primary
 *    counsellor, and asserts both the delete and the insert happened.
 * 2. **A "denied" result proves nothing against an empty table.** The `42501`
 *    and zero-row branches are asserted against fixtures that DO contain the
 *    target row, so the refusal comes from the modelled refusal rather than from
 *    there being nothing to write.
 * 3. **A write asserted only by its return value can be a lie.** PostgREST
 *    reports a `42501` as a resolved value, so every failure test also asserts
 *    the recorded writes — that the delete did not happen, or that it did.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const ADMIN = "admin-user-id";
const CASE = "aaaaaaaa-0000-4000-8000-000000000001";
/** A SECOND case in the same organization — see `twoCaseFixture`. */
const SIBLING_CASE = "aaaaaaaa-0000-4000-8000-000000000002";
const PERSONAL_CASE = "aaaaaaaa-0000-4000-8000-000000000009";

const ASSIGNMENT_ON_CASE = "ssssssss-0000-4000-8000-000000000001";
const ASSIGNMENT_ON_SIBLING = "ssssssss-0000-4000-8000-000000000002";

const MEMBERSHIP_A = "mmmmmmmm-0000-4000-8000-00000000000a";
const MEMBERSHIP_B = "mmmmmmmm-0000-4000-8000-00000000000b";
const COUNSELLOR_A = "counsellor-a-user-id";
const COUNSELLOR_B = "counsellor-b-user-id";

/**
 * A case in ORG with two active counsellors available to hold its single
 * primary slot, plus a personal case and a membership in a different
 * organization — so "the membership was resolved within this case's org" is a
 * property under test rather than an assumption.
 */
function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      {
        id: CASE,
        organization_id: ORG,
        student_user_id: null,
        display_name: "Case one",
        email: "one@example.test",
        operational_status: "new",
        archived_at: null,
      },
      {
        id: PERSONAL_CASE,
        organization_id: null,
        student_user_id: "some-student",
        display_name: "Personal",
        email: null,
        operational_status: "in_progress",
        archived_at: null,
      },
    ],
    organization_memberships: [
      { id: MEMBERSHIP_A, organization_id: ORG, user_id: COUNSELLOR_A, role: "counsellor", status: "active" },
      { id: MEMBERSHIP_B, organization_id: ORG, user_id: COUNSELLOR_B, role: "counsellor", status: "active" },
      {
        id: "mmmmmmmm-0000-4000-8000-00000000000c",
        organization_id: OTHER_ORG,
        user_id: "outsider-user-id",
        role: "counsellor",
        status: "active",
      },
    ],
    case_assignments: [],
    ...overrides,
  };
}

/** The same fixture, with COUNSELLOR_A already holding the primary slot. */
function assignedFixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return fixture({
    case_assignments: [
      {
        id: ASSIGNMENT_ON_CASE,
        case_id: CASE,
        user_id: COUNSELLOR_A,
        assignment_role: "primary_counsellor",
      },
    ],
    ...overrides,
  });
}

/**
 * TWO assigned cases in the same organization, which is what makes the delete's
 * PREDICATE observable.
 *
 * A single-row fixture cannot: with one row in the table, a delete scoped to the
 * assignment id and a delete carrying no predicate at all both leave the table
 * holding exactly the newly inserted row, so the two are the same value and the
 * suite passes either way. Seeding a second organization's-worth of work means an
 * unscoped delete takes a case nobody asked about with it, and the survivor
 * assertion below sees that.
 */
function twoCaseFixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return fixture({
    cases: [
      { id: CASE, organization_id: ORG, student_user_id: null, display_name: "Case one" },
      { id: SIBLING_CASE, organization_id: ORG, student_user_id: null, display_name: "Case two" },
      {
        id: PERSONAL_CASE,
        organization_id: null,
        student_user_id: "some-student",
        display_name: "Personal",
      },
    ],
    case_assignments: [
      {
        id: ASSIGNMENT_ON_CASE,
        case_id: CASE,
        user_id: COUNSELLOR_A,
        assignment_role: "primary_counsellor",
      },
      {
        id: ASSIGNMENT_ON_SIBLING,
        case_id: SIBLING_CASE,
        user_id: COUNSELLOR_A,
        assignment_role: "primary_counsellor",
      },
    ],
    ...overrides,
  });
}

describe("createOrgCase — cell 8", () => {
  test("writes the organization, the name, and the actor as creator", async () => {
    const db = fakeCaseDb({ cases: [] });

    const result = await createOrgCase(ADMIN, ORG, { displayName: "  Case one  " }, db.client);

    expect(result).toEqual({ ok: true, caseId: expect.any(String) });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]!.table).toBe("cases");
    expect(db.inserts[0]!.row).toMatchObject({
      organization_id: ORG,
      display_name: "Case one",
      created_by: ADMIN,
    });
  });

  test("never names student_user_id — a staff-created case is unclaimed by construction", async () => {
    const db = fakeCaseDb({ cases: [] });

    await createOrgCase(ADMIN, ORG, { displayName: "Case one" }, db.client);

    // Spec §6.3: `owner IS NULL`, `case_id` set, `student_user_id IS NULL`.
    // Stage 5 owns linking a student; a value here would be inventing it early,
    // and `cases_insert_admin` would refuse anyone but the creator anyway.
    expect(db.inserts[0]!.row).not.toHaveProperty("student_user_id");
  });

  test("never names operational_status — the column default is the whole answer", async () => {
    const db = fakeCaseDb({ cases: [] });

    await createOrgCase(ADMIN, ORG, { displayName: "Case one" }, db.client);

    // The write-surface trigger is BEFORE UPDATE and does not fire on INSERT, so
    // a client-supplied status here would carry no guard at all.
    expect(db.inserts[0]!.row).not.toHaveProperty("operational_status");
  });

  test("stores a trimmed email address", async () => {
    const db = fakeCaseDb({ cases: [] });

    await createOrgCase(ADMIN, ORG, { displayName: "Case one", email: " a@b.test " }, db.client);

    expect(db.inserts[0]!.row).toMatchObject({ email: "a@b.test" });
  });

  test("stores null rather than an empty string when the email is blank or omitted", async () => {
    const blank = fakeCaseDb({ cases: [] });
    await createOrgCase(ADMIN, ORG, { displayName: "Case one", email: "   " }, blank.client);
    expect(blank.inserts[0]!.row).toMatchObject({ email: null });

    const omitted = fakeCaseDb({ cases: [] });
    await createOrgCase(ADMIN, ORG, { displayName: "Case one" }, omitted.client);
    expect(omitted.inserts[0]!.row).toMatchObject({ email: null });
  });

  test("refuses a blank display name without touching the database", async () => {
    const db = fakeCaseDb({ cases: [] });

    const result = await createOrgCase(ADMIN, ORG, { displayName: "   " }, db.client);

    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(db.inserts).toHaveLength(0);
    expect(db.queries).toHaveLength(0);
  });

  test("refuses a blank actor or organization without touching the database", async () => {
    const noActor = fakeCaseDb({ cases: [] });
    expect(await createOrgCase("", ORG, { displayName: "Case one" }, noActor.client)).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(noActor.queries).toHaveLength(0);

    const noOrg = fakeCaseDb({ cases: [] });
    expect(await createOrgCase(ADMIN, "  ", { displayName: "Case one" }, noOrg.client)).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(noOrg.queries).toHaveLength(0);
  });

  test("reads a 42501 as a refusal, not as a success", async () => {
    // The failure mode that makes a green suite lie: PostgREST RESOLVES a
    // grant/policy violation rather than rejecting, so a call site that does not
    // destructure `error` reports the write as done.
    const db = fakeCaseDb(
      { cases: [] },
      { insertError: { cases: { code: "42501", message: "permission denied for table cases" } } },
    );

    expect(await createOrgCase(ADMIN, ORG, { displayName: "Case one" }, db.client)).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("reads any other PostgREST error as a write failure, not as a refusal", async () => {
    const db = fakeCaseDb(
      { cases: [] },
      { insertError: { cases: { code: "57014", message: "canceling statement due to statement timeout" } } },
    );

    expect(await createOrgCase(ADMIN, ORG, { displayName: "Case one" }, db.client)).toEqual({
      ok: false,
      reason: "write-failed",
    });
  });

  test("a thrown client is a write failure rather than an escaping exception", async () => {
    const db = fakeCaseDb({ cases: [] }, { throwOn: ["cases"] });

    expect(await createOrgCase(ADMIN, ORG, { displayName: "Case one" }, db.client)).toEqual({
      ok: false,
      reason: "write-failed",
    });
  });
});

describe("setCaseOperationalStatus — cell 10", () => {
  test("writes a value from the check-constrained vocabulary", async () => {
    const db = fakeCaseDb(fixture());

    const result = await setCaseOperationalStatus(CASE, "in_progress", db.client);

    expect(result).toEqual({ ok: true });
    expect(db.updates).toEqual([{ table: "cases", patch: { operational_status: "in_progress" } }]);
  });

  test("writes no column but operational_status", async () => {
    const db = fakeCaseDb(fixture());

    await setCaseOperationalStatus(CASE, "closed", db.client);

    // `cases` grants UPDATE on four columns and the trigger guards only two of
    // them; a patch that reached wider would be writing `display_name` or
    // `archived_at` with no gate in front of it. Archiving is Stage 6.
    expect(Object.keys(db.updates[0]!.patch)).toEqual(["operational_status"]);
  });

  test("refuses a value outside the vocabulary without querying", async () => {
    const db = fakeCaseDb(fixture());

    const result = await setCaseOperationalStatus(CASE, "on_hold", db.client);

    expect(result).toEqual({ ok: false, reason: "invalid-input" });
    expect(db.updates).toHaveLength(0);
    expect(db.queries).toHaveLength(0);
  });

  test("refuses a blank case id without querying", async () => {
    const db = fakeCaseDb(fixture());

    expect(await setCaseOperationalStatus("  ", "closed", db.client)).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(db.queries).toHaveLength(0);
  });

  test("reads the trigger's 42501 as a refusal", async () => {
    // `enforce_case_write_surface` raises 42501 when the actor is not
    // `can_staff_case(old.id)`. It is a TRIGGER, not RLS — reading the policy
    // alone would conclude the linked student may write this column.
    const db = fakeCaseDb(fixture(), {
      updateError: {
        cases: {
          code: "42501",
          message: "cases.operational_status is writable only by consultancy staff on this case",
        },
      },
    });

    expect(await setCaseOperationalStatus(CASE, "closed", db.client)).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("reads zero rows affected as a refusal, because that is how a policy refuses", async () => {
    // The row exists — the fixture holds it — but the filters match nothing the
    // policy admits. Postgres reports that as zero rows, never as an error.
    const db = fakeCaseDb(fixture());

    expect(await setCaseOperationalStatus("no-such-case", "closed", db.client)).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("reads any other PostgREST error as a write failure", async () => {
    const db = fakeCaseDb(fixture(), {
      updateError: { cases: { code: "57014", message: "statement timeout" } },
    });

    expect(await setCaseOperationalStatus(CASE, "closed", db.client)).toEqual({
      ok: false,
      reason: "write-failed",
    });
  });

  test("a thrown client is a write failure rather than an escaping exception", async () => {
    const db = fakeCaseDb(fixture(), { throwOn: ["cases"] });

    expect(await setCaseOperationalStatus(CASE, "closed", db.client)).toEqual({
      ok: false,
      reason: "write-failed",
    });
  });
});

/**
 * `readOrgCase` had NO direct test. Its only call site — the manage page — mocks
 * it, so the outage-versus-404 branch never executed anywhere in the suite: a
 * lookup that FAILED and a case that genuinely does not exist could have returned
 * the same value and nothing would have gone red. They render as an outage and a
 * `notFound()` respectively, and swapping them tells a legitimate admin their
 * student does not exist because Supabase blipped.
 */
describe("readOrgCase", () => {
  test("maps the row the manage surface needs, and carries the organization", async () => {
    const db = fakeCaseDb(fixture());

    const result = await readOrgCase(CASE, db.client);

    expect(result).toEqual({
      ok: true,
      data: {
        id: CASE,
        organizationId: ORG,
        displayName: "Case one",
        email: "one@example.test",
        operationalStatus: "new",
        hasLinkedStudent: false,
        archivedAt: null,
      },
    });
    // The organization is carried because a single-case page takes the case from
    // the URL and the organization from the URL, and has to check the two agree.
    expect(db.queries[0]!.filters).toEqual([["id", CASE]]);
  });

  test("derives hasLinkedStudent from student_user_id and NEVER carries the id itself", async () => {
    const db = fakeCaseDb(fixture());

    const result = await readOrgCase(PERSONAL_CASE, db.client);

    // MV-170's rule: a raw Auth user id is no use to a counsellor and does not
    // belong in markup. What the surface needs from it is the boolean.
    expect(result).toMatchObject({
      ok: true,
      // A NULL email is carried as null, never as "" — "no email address on file"
      // is a real state and an empty string would render as an address.
      data: { hasLinkedStudent: true, email: null },
    });
    expect(JSON.stringify(result)).not.toContain("some-student");
  });

  test("a case that does not exist is data: null, NOT a failure", async () => {
    const db = fakeCaseDb(fixture());

    expect(await readOrgCase("no-such-case", db.client)).toEqual({ ok: true, data: null });
  });

  test("a read that FAILED is a failure, and must not render as a missing case", async () => {
    const db = fakeCaseDb(fixture(), { errorOn: { cases: { message: "connection reset" } } });

    const result = await readOrgCase(CASE, db.client);

    expect(result).toEqual({ ok: false, reason: "lookup-failed" });
    // The whole point: the two are DIFFERENT values. A branch that collapsed them
    // would 404 an existing student because a query timed out.
    expect(result).not.toEqual({ ok: true, data: null });
  });

  test("a thrown client is a failure rather than an escaping exception", async () => {
    const db = fakeCaseDb(fixture(), { throwOn: ["cases"] });

    expect(await readOrgCase(CASE, db.client)).toEqual({ ok: false, reason: "lookup-failed" });
  });

  test("refuses a blank case id without querying", async () => {
    const db = fakeCaseDb(fixture());

    expect(await readOrgCase("   ", db.client)).toEqual({ ok: false, reason: "lookup-failed" });
    expect(db.queries).toHaveLength(0);
  });
});

describe("readPrimaryCounsellor", () => {
  test("returns the row filtered by the assignment role, not merely by case", async () => {
    const db = fakeCaseDb(assignedFixture());

    const result = await readPrimaryCounsellor(CASE, db.client);

    expect(result).toEqual({
      ok: true,
      data: { assignmentId: expect.any(String), userId: COUNSELLOR_A },
    });
    expect(db.queries[0]!.filters).toEqual(
      expect.arrayContaining([
        ["case_id", CASE],
        ["assignment_role", PRIMARY_COUNSELLOR_ROLE],
      ]),
    );
  });

  test("returns null when the case has no primary counsellor", async () => {
    const db = fakeCaseDb(fixture());

    expect(await readPrimaryCounsellor(CASE, db.client)).toEqual({ ok: true, data: null });
  });

  test("a failed read is a failure, never an unassigned case", async () => {
    const db = fakeCaseDb(assignedFixture(), {
      errorOn: { case_assignments: { message: "connection reset" } },
    });

    expect(await readPrimaryCounsellor(CASE, db.client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });
});

describe("assignPrimaryCounsellor — cell 9", () => {
  test("assigns the single primary slot when the case has none", async () => {
    const db = fakeCaseDb(fixture());

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_A, db.client);

    expect(result).toEqual({ ok: true, changed: true });
    expect(db.deletes).toHaveLength(0);
    expect(db.inserts).toEqual([
      {
        table: "case_assignments",
        row: { case_id: CASE, user_id: COUNSELLOR_A, assignment_role: PRIMARY_COUNSELLOR_ROLE },
      },
    ]);
  });

  test("REPLACES the existing primary counsellor — delete first, then insert", async () => {
    // The order is forced: `case_assignments_primary_idx` is a partial unique
    // index on (case_id) where assignment_role = 'primary_counsellor', so
    // inserting first raises 23505. There is no UPDATE grant or policy to reach
    // for instead — the migration withheld both on purpose.
    const db = fakeCaseDb(assignedFixture());

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: true, changed: true });
    expect(db.deletes).toHaveLength(1);
    expect(db.deletes[0]!.table).toBe("case_assignments");
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]!.row).toMatchObject({ user_id: COUNSELLOR_B });

    // Exactly one primary row survives, and it is the new one. This is the
    // assertion a single-row fixture could not make.
    const remaining = (db.rows["case_assignments"] ?? []).filter(
      (row) => row["assignment_role"] === PRIMARY_COUNSELLOR_ROLE,
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!["user_id"]).toBe(COUNSELLOR_B);
  });

  test("deletes BY ASSIGNMENT ID — another case's counsellor is not collateral", async () => {
    // The predicate is the whole safety property, and a one-row fixture cannot see
    // it: with a single row in the table, `delete().eq("id", …)` and a delete
    // carrying no predicate at all both end with the table holding exactly the new
    // row. Two assigned cases make an unscoped delete visible as a case nobody
    // asked about losing its counsellor.
    const db = fakeCaseDb(twoCaseFixture());

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: true, changed: true });
    expect(db.deletes).toHaveLength(1);
    expect(db.deletes[0]!.table).toBe("case_assignments");
    // Scoped to the row that was read back, NOT to `case_id` and NOT unscoped.
    expect(db.deletes[0]!.filters).toEqual([["id", ASSIGNMENT_ON_CASE]]);

    const remaining = db.rows["case_assignments"] ?? [];
    // The sibling case still has the counsellor it started with.
    const sibling = remaining.filter((row) => row["case_id"] === SIBLING_CASE);
    expect(sibling).toHaveLength(1);
    expect(sibling[0]!["id"]).toBe(ASSIGNMENT_ON_SIBLING);
    expect(sibling[0]!["user_id"]).toBe(COUNSELLOR_A);
    // And this case holds exactly its replacement.
    const own = remaining.filter((row) => row["case_id"] === CASE);
    expect(own).toHaveLength(1);
    expect(own[0]!["user_id"]).toBe(COUNSELLOR_B);
  });

  test("assigning the counsellor who already holds the slot writes nothing", async () => {
    const db = fakeCaseDb(assignedFixture());

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_A, db.client);

    // A delete-and-reinsert here would churn the row and open the replacement
    // window for no change at all — and reporting `changed: true` would tell the
    // admin something happened that did not.
    expect(result).toEqual({ ok: true, changed: false });
    expect(db.deletes).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  test("refuses an unknown membership BEFORE deleting the existing assignment", async () => {
    const db = fakeCaseDb(assignedFixture());

    const result = await assignPrimaryCounsellor(CASE, "no-such-membership", db.client);

    expect(result).toEqual({ ok: false, reason: "unknown-member", leftUnassigned: false });
    expect(db.deletes).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  test("refuses an inactive member BEFORE deleting the existing assignment", async () => {
    const db = fakeCaseDb(
      assignedFixture({
        organization_memberships: [
          { id: MEMBERSHIP_A, organization_id: ORG, user_id: COUNSELLOR_A, role: "counsellor", status: "active" },
          { id: MEMBERSHIP_B, organization_id: ORG, user_id: COUNSELLOR_B, role: "counsellor", status: "inactive" },
        ],
      }),
    );

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    // `case_assignments_insert_admin`'s `is_case_org_member` conjunct requires an
    // ACTIVE membership, so the insert would fail anyway — but by then the
    // previous assignment is already gone. Checking first is what stops a bad
    // request from stranding a case.
    expect(result).toEqual({ ok: false, reason: "member-inactive", leftUnassigned: false });
    expect(db.deletes).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  test("a membership in a different organization is not found for this case", async () => {
    const db = fakeCaseDb(assignedFixture());

    const result = await assignPrimaryCounsellor(
      CASE,
      "mmmmmmmm-0000-4000-8000-00000000000c",
      db.client,
    );

    expect(result).toEqual({ ok: false, reason: "unknown-member", leftUnassigned: false });
    expect(db.deletes).toHaveLength(0);
  });

  test("refuses a case that does not exist", async () => {
    const db = fakeCaseDb(fixture());

    expect(await assignPrimaryCounsellor("no-such-case", MEMBERSHIP_A, db.client)).toEqual({
      ok: false,
      reason: "unknown-case",
      leftUnassigned: false,
    });
    expect(db.inserts).toHaveLength(0);
  });

  test("refuses a personal case — there is no organization to be a member of", async () => {
    const db = fakeCaseDb(fixture());

    expect(await assignPrimaryCounsellor(PERSONAL_CASE, MEMBERSHIP_A, db.client)).toEqual({
      ok: false,
      reason: "not-an-org-case",
      leftUnassigned: false,
    });
    expect(db.inserts).toHaveLength(0);
  });

  test("refuses blank identifiers without touching the database", async () => {
    const db = fakeCaseDb(fixture());

    expect(await assignPrimaryCounsellor("", MEMBERSHIP_A, db.client)).toEqual({
      ok: false,
      reason: "invalid-input",
      leftUnassigned: false,
    });
    expect(await assignPrimaryCounsellor(CASE, "  ", db.client)).toEqual({
      ok: false,
      reason: "invalid-input",
      leftUnassigned: false,
    });
    expect(db.queries).toHaveLength(0);
  });

  test("a refused delete leaves the existing assignment in place and says so", async () => {
    const db = fakeCaseDb(assignedFixture(), {
      deleteError: { case_assignments: { code: "42501", message: "permission denied" } },
    });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: false, reason: "denied", leftUnassigned: false });
    expect(db.inserts).toHaveLength(0);
  });

  test("a delete the POLICY refuses — zero rows, no error — is a denial, not a replacement", async () => {
    // Found by mutation testing, not by review: deleting the zero-rows check
    // left the suite GREEN, because the only refused-delete test modelled a
    // `42501`. This is the OTHER refusal, and it is reachable — an assigned
    // counsellor passes `case_assignments_select_accessor` and so can READ the
    // assignment row, but `case_assignments_delete_admin` requires
    // `can_manage_case`, so their delete affects zero rows and raises nothing.
    // Without the check the route would go on to insert, and the case would end
    // up with two primary-counsellor rows the unique index exists to forbid.
    const db = fakeCaseDb(assignedFixture(), { deleteRefused: ["case_assignments"] });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: false, reason: "denied", leftUnassigned: false });
    expect(db.inserts).toHaveLength(0);
    // The row the delete did not remove is still there — and THAT is what makes
    // this a denial rather than the lost race below.
    expect(db.rows["case_assignments"]).toHaveLength(1);
  });

  test("a LOST RACE is a conflict, not a permission denial", async () => {
    // Zero rows affected is how a policy refuses AND how a lost race looks: another
    // admin deleted the same assignment microseconds earlier, so our predicate
    // matches nothing and Postgres raises nothing. Reporting that to the user as
    // "you may not do this" is a claim about their permissions that is simply
    // false, and it sends them to ask a colleague instead of retrying.
    //
    // The two ARE distinguishable, by one cheap read: after a zero-row delete, the
    // row we read back is either still there (the policy refused us) or gone
    // (somebody else got there first).
    const db = fakeCaseDb(assignedFixture(), { deleteLostRace: ["case_assignments"] });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({
      ok: false,
      reason: "reassignment-conflict",
      leftUnassigned: false,
    });
    // Our delete removed nothing, so we did not strand the case — whoever won the
    // race owns the outcome.
    expect(db.inserts).toHaveLength(0);
  });

  test("a lost race whose re-read also fails is an outage, not a conflict", async () => {
    // The disambiguating read can itself fail, and "we could not tell" must not be
    // dressed up as either of the two answers it was asked to choose between.
    const db = fakeCaseDb(assignedFixture(), {
      deleteLostRace: ["case_assignments"],
      errorAfterDelete: ["case_assignments"],
    });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: false, reason: "lookup-failed", leftUnassigned: false });
    expect(db.inserts).toHaveLength(0);
  });

  test("an insert that fails AFTER the delete succeeded reports the case as unassigned", async () => {
    // The honest branch. The unique index forces delete-then-insert, so this
    // window exists; the result names the state the case is actually in rather
    // than reporting a generic failure that reads as "nothing happened".
    const db = fakeCaseDb(assignedFixture(), {
      insertError: { case_assignments: { code: "57014", message: "statement timeout" } },
    });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: false, reason: "write-failed", leftUnassigned: true });
    expect(db.deletes).toHaveLength(1);
  });

  test("an insert that fails with no prior assignment leaves nothing unassigned", async () => {
    const db = fakeCaseDb(fixture(), {
      insertError: { case_assignments: { code: "42501", message: "permission denied" } },
    });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_A, db.client);

    expect(result).toEqual({ ok: false, reason: "denied", leftUnassigned: false });
    expect(db.deletes).toHaveLength(0);
  });

  test("a failed read of the current assignment does not become an assignment", async () => {
    const db = fakeCaseDb(assignedFixture(), {
      errorOn: { case_assignments: { message: "connection reset" } },
    });

    const result = await assignPrimaryCounsellor(CASE, MEMBERSHIP_B, db.client);

    expect(result).toEqual({ ok: false, reason: "lookup-failed", leftUnassigned: false });
    expect(db.inserts).toHaveLength(0);
    expect(db.deletes).toHaveLength(0);
  });

  test("writes the single check-constrained assignment role literal", async () => {
    const db = fakeCaseDb(fixture());

    await assignPrimaryCounsellor(CASE, MEMBERSHIP_A, db.client);

    // `case_assignments_assignment_role_check` admits exactly this one value, and
    // `case_assignments_insert_admin` does NOT constrain the column — so the
    // literal written here is the only thing standing between the app and a
    // second role the policy would admit without further authority.
    expect(PRIMARY_COUNSELLOR_ROLE).toBe("primary_counsellor");
    expect(db.inserts[0]!.row).toMatchObject({ assignment_role: "primary_counsellor" });
  });
});
