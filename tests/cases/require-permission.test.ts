import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CaseAuthorizationError,
  checkCasePermission,
  requireCasePermission,
} from "@/lib/cases/require-permission";
import { CASE_SCOPED_PERMISSIONS, type CaseScopedPermission } from "@/lib/cases/permissions";
import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";
import type { CaseAuthorizationClient } from "@/lib/cases/context";

const ORG_A = "org-a";
const ORG_B = "org-b";
const OWNER_A = "user-owner-a";
const COUNSELLOR_A = "user-counsellor-a";
const UNASSIGNED_COUNSELLOR_A = "user-counsellor-unassigned-a";
const REVOKED_OWNER_A = "user-owner-revoked-a";
const OWNER_B = "user-owner-b";
const STUDENT_A1 = "user-student-a1";
const CASE_A1 = "case-a1";

const FIXTURE: CaseDbFixture = {
  cases: [{ id: CASE_A1, organization_id: ORG_A, student_user_id: STUDENT_A1 }],
  organization_memberships: [
    { organization_id: ORG_A, user_id: OWNER_A, role: "owner", status: "active" },
    { organization_id: ORG_A, user_id: COUNSELLOR_A, role: "counsellor", status: "active" },
    { organization_id: ORG_A, user_id: UNASSIGNED_COUNSELLOR_A, role: "counsellor", status: "active" },
    { organization_id: ORG_A, user_id: REVOKED_OWNER_A, role: "owner", status: "inactive" },
    { organization_id: ORG_B, user_id: OWNER_B, role: "owner", status: "active" },
  ],
  case_assignments: [{ case_id: CASE_A1, user_id: COUNSELLOR_A, assignment_role: "primary_counsellor" }],
};

function db() {
  return fakeCaseDb(FIXTURE);
}

describe("requireCasePermission — allowed claims resolve to the context", () => {
  test("an owner passes and receives the resolved context", async () => {
    const { client } = db();
    const context = await requireCasePermission(OWNER_A, CASE_A1, "case.export", client);
    expect(context.membershipRole).toBe("owner");
    expect(context.accessScope).toBe("all-org");
    expect(context.hasAccess).toBe(true);
  });

  test("an assigned counsellor passes for an assigned-scope claim", async () => {
    const { client } = db();
    const context = await requireCasePermission(COUNSELLOR_A, CASE_A1, "case.notes.internal", client);
    expect(context.isAssignedToCase).toBe(true);
  });

  test("the linked student passes for a linked-scope claim", async () => {
    const { client } = db();
    const context = await requireCasePermission(STUDENT_A1, CASE_A1, "case.read", client);
    expect(context.membershipRole).toBeNull();
    expect(context.grantedRoles).toEqual(["student"]);
  });
});

describe("requireCasePermission — every denial throws the typed error", () => {
  async function expectDenied(
    actor: string,
    permission: CaseScopedPermission,
    reason: string,
    client: CaseAuthorizationClient,
  ) {
    const error = await requireCasePermission(actor, CASE_A1, permission, client).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(CaseAuthorizationError);
    const authError = error as CaseAuthorizationError;
    expect(authError.permission).toBe(permission);
    expect(authError.caseId).toBe(CASE_A1);
    expect(authError.reason).toBe(reason);
    return authError;
  }

  test("an unassigned counsellor is denied", async () => {
    const { client } = db();
    await expectDenied(UNASSIGNED_COUNSELLOR_A, "case.read", "not-assigned", client);
  });

  test("a counsellor is denied an owner/admin-only claim", async () => {
    const { client } = db();
    await expectDenied(COUNSELLOR_A, "case.delete", "role-not-permitted", client);
  });

  test("a student is denied consultancy-internal notes", async () => {
    const { client } = db();
    await expectDenied(STUDENT_A1, "case.notes.internal", "role-not-permitted", client);
  });

  test("an owner of another organization is denied", async () => {
    const { client } = db();
    await expectDenied(OWNER_B, "case.read", "no-relationship", client);
  });

  test("a revoked owner is denied every single claim", async () => {
    const { client } = db();
    for (const permission of CASE_SCOPED_PERMISSIONS) {
      await expectDenied(REVOKED_OWNER_A, permission, "membership-inactive", client);
    }
  });

  test("an unknown case is denied", async () => {
    const { client } = db();
    const error = await requireCasePermission(OWNER_A, "case-nope", "case.read", client).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(CaseAuthorizationError);
    expect((error as CaseAuthorizationError).reason).toBe("unknown-case");
  });

  test("an unknown permission is denied even for an owner", async () => {
    const { client } = db();
    await expectDenied(OWNER_A, "case.seize" as CaseScopedPermission, "unknown-permission", client);
  });

  test("a failed lookup is denied, not surfaced as a success or a raw crash", async () => {
    const { client } = fakeCaseDb(FIXTURE, { errorOn: { cases: { message: "boom" } } });
    await expectDenied(OWNER_A, "case.read", "lookup-failed", client);
  });

  test("the error is a real Error, named, and carries no identifiers in its message", async () => {
    const { client } = db();
    const error = await expectDenied(UNASSIGNED_COUNSELLOR_A, "case.read", "not-assigned", db().client);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CaseAuthorizationError");
    // Callers may log or bubble this; it must not carry the actor or case id
    // (CLAUDE.md §Architecture Rules — no sensitive data in client-side logs).
    expect(error.message).not.toContain(UNASSIGNED_COUNSELLOR_A);
    expect(error.message).not.toContain(CASE_A1);
    expect(error.message).toContain("case.read");
    void client;
  });
});

describe("role is DB-sourced — forgery has no effect", () => {
  test("a role planted in user_metadata is ignored, and the session is never read", async () => {
    const { from } = db();
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: UNASSIGNED_COUNSELLOR_A,
          app_metadata: { role: "owner" },
          user_metadata: { role: "owner", organization_id: ORG_A },
        },
      },
      error: null,
    }));
    const getSession = vi.fn(async () => ({ data: { session: { user: { role: "owner" } } }, error: null }));
    // A client that carries a real query surface AND a booby-trapped auth surface:
    // if the layer ever consulted the session to learn a role, the spies would fire.
    const clientWithForgedSession = {
      from,
      auth: { getUser, getSession },
    } as unknown as CaseAuthorizationClient;

    // The DB says: counsellor, not assigned to this case. The forged metadata says owner.
    const error = await requireCasePermission(
      UNASSIGNED_COUNSELLOR_A,
      CASE_A1,
      "case.delete",
      clientWithForgedSession,
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(CaseAuthorizationError);
    // Not merely denied — the metadata was never consulted in the first place.
    expect(getUser).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  test("there is no caller-supplied role argument to forge", () => {
    // The signature is exactly (actorUserId, caseId, permission, db) — a caller
    // cannot assert a role at all, which is the structural half of the guarantee.
    // Adding a fifth parameter (an `actorRole` override being the dangerous one)
    // fails this test and forces the change through review.
    expect(requireCasePermission.length).toBe(4);
    expect(checkCasePermission.length).toBe(4);
  });

  test("a stale membership row still in the fixture cannot be overridden by intent", async () => {
    // Same actor, two different claims: the DB row decides both, so an allow on
    // one claim never widens into an allow on another.
    const { client } = db();
    await expect(requireCasePermission(COUNSELLOR_A, CASE_A1, "case.read", client)).resolves.toBeTruthy();
    await expect(requireCasePermission(COUNSELLOR_A, CASE_A1, "case.export", client)).rejects.toBeInstanceOf(
      CaseAuthorizationError,
    );
  });
});

describe("checkCasePermission — the non-throwing form", () => {
  test("returns the decision and the context without throwing on a deny", async () => {
    const { client } = db();
    const result = await checkCasePermission(UNASSIGNED_COUNSELLOR_A, CASE_A1, "case.read", client);
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.reason).toBe("not-assigned");
    expect(result.context.membershipRole).toBe("counsellor");
  });

  test("agrees with requireCasePermission on every claim for every fixture actor", async () => {
    for (const actor of [OWNER_A, COUNSELLOR_A, UNASSIGNED_COUNSELLOR_A, REVOKED_OWNER_A, OWNER_B, STUDENT_A1]) {
      for (const permission of CASE_SCOPED_PERMISSIONS) {
        const { client } = db();
        const { decision } = await checkCasePermission(actor, CASE_A1, permission, client);
        const threw = await requireCasePermission(actor, CASE_A1, permission, db().client).then(
          () => false,
          () => true,
        );
        expect(threw).toBe(!decision.allowed);
      }
    }
  });
});
