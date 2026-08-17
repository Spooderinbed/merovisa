import { describe, it, expect, vi } from "vitest";
import { fakeCaseDb, sawQuery } from "../helpers/fake-case-db";

vi.mock("server-only", () => ({}));

const { isStaffOnCase, readCaseAssignee } = await import("@/lib/cases/case-frame");

/**
 * MV-181 — the one fact the persistent case frame reads that the gate does not:
 * who is on this case (spec §1, item 6 — "Primary assignee as `Role · 8-character
 * id`, 'Unassigned,' or 'Access switched off · Role · id'").
 *
 * Four answers, and they must never collapse into three:
 *
 * - **withheld** — the viewer is not staff on the case, so the read is not made.
 *   `case_assignments_select_accessor` admits only staff, and an RLS refusal is
 *   ZERO ROWS AND NO ERROR, so the read would come back indistinguishable from
 *   "nobody is assigned". MV-171 already learned this on the manage page; the
 *   frame must not relearn it (MISTAKES.md: silent failures).
 * - **unknown** — a read that failed. Never "unassigned".
 * - **unassigned** — the slot is genuinely empty.
 * - **assigned** — with the role and standing the reference needs to say
 *   "Access switched off" out loud.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-a222-222222222222";
const COUNSELLOR = "7f3c9a1e-4b2d-4c6e-8a10-000000000001";

const STAFF = { isStaffOnCase: true };

function db(fixture = {}, options = {}) {
  return fakeCaseDb(
    {
      case_assignments: [
        {
          id: "assignment-1",
          case_id: CASE,
          user_id: COUNSELLOR,
          assignment_role: "primary_counsellor",
        },
      ],
      organization_memberships: [
        {
          id: "membership-1",
          organization_id: ORG,
          user_id: COUNSELLOR,
          role: "counsellor",
          status: "active",
        },
      ],
      ...fixture,
    },
    options,
  );
}

describe("isStaffOnCase", () => {
  it("is true for a membership role the case's organization granted", () => {
    expect(isStaffOnCase(["counsellor"])).toBe(true);
    expect(isStaffOnCase(["owner"])).toBe(true);
    expect(isStaffOnCase(["admin"])).toBe(true);
  });

  it("is false for the linked student, who holds case.read without being staff", () => {
    // `CASE_PERMISSION_MATRIX.student["case.read"]` is `linked`, so the student
    // passes the frame's gate. Who staffs their case is consultancy-internal.
    expect(isStaffOnCase(["student"])).toBe(false);
  });

  it("is false when the grants context carried nothing", () => {
    expect(isStaffOnCase([])).toBe(false);
    expect(isStaffOnCase(undefined)).toBe(false);
  });
});

describe("readCaseAssignee", () => {
  it("does not ask who staffs the case when the viewer is not staff on it", async () => {
    const fake = db();

    const result = await readCaseAssignee(CASE, ORG, { isStaffOnCase: false }, fake.client);

    expect(result).toEqual({ state: "withheld" });
    // The read is not made, because its two answers are indistinguishable AFTER it.
    expect(sawQuery(fake.queries, "case_assignments", [["case_id", CASE]])).toBe(false);
  });

  it("reports the assignee with the role and standing the reference needs", async () => {
    const fake = db();

    const result = await readCaseAssignee(CASE, ORG, STAFF, fake.client);

    expect(result).toEqual({
      state: "assigned",
      userId: COUNSELLOR,
      role: "counsellor",
      active: true,
    });
  });

  it("says an assignee whose membership was switched off is switched off", async () => {
    // Spec §2: "Needs assignment includes both" — an assignment to an inactive
    // member is not a staffed case, and the frame must not imply it is.
    const fake = db({
      organization_memberships: [
        {
          id: "membership-1",
          organization_id: ORG,
          user_id: COUNSELLOR,
          role: "counsellor",
          status: "inactive",
        },
      ],
    });

    const result = await readCaseAssignee(CASE, ORG, STAFF, fake.client);

    expect(result).toEqual({
      state: "assigned",
      userId: COUNSELLOR,
      role: "counsellor",
      active: false,
    });
  });

  it("reads an assignee with no membership row at all as unknown and switched off", async () => {
    // `queue-repo.ts`'s rule, verbatim: never dropped — the case still needs
    // assigning — and never shown as an active member of this organization.
    const fake = db({ organization_memberships: [] });

    const result = await readCaseAssignee(CASE, ORG, STAFF, fake.client);

    expect(result).toEqual({
      state: "assigned",
      userId: COUNSELLOR,
      role: "unknown",
      active: false,
    });
  });

  it("says the slot is empty only when it is genuinely empty", async () => {
    const fake = db({ case_assignments: [] });

    expect(await readCaseAssignee(CASE, ORG, STAFF, fake.client)).toEqual({ state: "unassigned" });
  });

  it("does NOT claim the case is unassigned when the assignment read failed", async () => {
    // A failed read wearing the "nobody is assigned" answer tells an admin to
    // assign somebody who is already assigned.
    const fake = db({}, { errorOn: { case_assignments: { message: "boom" } } });

    expect(await readCaseAssignee(CASE, ORG, STAFF, fake.client)).toEqual({ state: "unknown" });
  });

  it("does NOT invent an active assignee when the membership read failed", async () => {
    // The half-answer is the dangerous one: the assignment row alone would render
    // a confident "Counsellor · 7f3c9a1e" for a member who may have been switched
    // off, which is the sentence the reader would act on.
    const fake = db({}, { errorOn: { organization_memberships: { message: "boom" } } });

    expect(await readCaseAssignee(CASE, ORG, STAFF, fake.client)).toEqual({ state: "unknown" });
  });

  it("scopes the membership lookup to this organization, not just this user", async () => {
    const fake = db();

    await readCaseAssignee(CASE, ORG, STAFF, fake.client);

    expect(
      sawQuery(fake.queries, "organization_memberships", [
        ["organization_id", ORG],
        ["user_id", COUNSELLOR],
      ]),
    ).toBe(true);
  });
});
