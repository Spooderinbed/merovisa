import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decideMembershipChange,
  type MembershipChangeFacts,
} from "@/lib/org/membership-change";

/**
 * The pure half of access-matrix cell 5 (spec §4): "team role change / deactivate".
 *
 * This mirrors `organization_memberships_update_admin`
 * (20260730180000_case_aware_rls_policies.sql:373), which carries the SAME conjunct
 * in USING and in WITH CHECK:
 *
 *   organization_id = any (actor_admin_org_ids())
 *   and (role <> 'owner' or organization_id = any (actor_owner_org_ids()))
 *
 * USING gates the row as it STANDS, WITH CHECK the row as it WOULD BECOME — so an
 * admin can neither touch an owner's membership nor promote anyone (themselves
 * included) to owner. A TypeScript layer that mirrors only one of the two horns
 * looks correct and is wrong: it would let an admin demote the owner.
 *
 * The org-level gate (is the actor an admin here at all?) is NOT this function's
 * job — `requireOrgPermission(..., "org.manage")` answers that from the database.
 * This decides only what an actor who already holds `org.manage` may do to one row.
 */

function facts(overrides: Partial<MembershipChangeFacts> = {}): MembershipChangeFacts {
  return {
    actorUserId: "actor-admin",
    actorIsOwner: false,
    targetUserId: "target-counsellor",
    targetCurrentRole: "counsellor",
    ...overrides,
  };
}

describe("decideMembershipChange — the owner carve-out, both horns", () => {
  test("an admin may change a counsellor's role and status", () => {
    expect(decideMembershipChange({ role: "admin" }, facts())).toEqual({
      allowed: true,
      change: { role: "admin" },
    });
    expect(decideMembershipChange({ status: "inactive" }, facts())).toEqual({
      allowed: true,
      change: { status: "inactive" },
    });
  });

  test("WITH CHECK horn: an admin may not promote anyone to owner", () => {
    const decision = decideMembershipChange({ role: "owner" }, facts());
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: "owner-role-reserved" });
  });

  test("USING horn: an admin may not touch a row that IS an owner's", () => {
    // The defect this catches: mirroring only WITH CHECK leaves "demote the owner
    // to counsellor" allowed in TypeScript, because the *requested* role is not
    // 'owner'. The database refuses it; the app layer must agree.
    const ownersRow = facts({ targetUserId: "the-owner", targetCurrentRole: "owner" });
    for (const change of [{ role: "counsellor" as const }, { status: "inactive" as const }]) {
      const decision = decideMembershipChange(change, ownersRow);
      expect(decision.allowed, JSON.stringify(change)).toBe(false);
      expect(decision).toMatchObject({ reason: "owner-row-reserved" });
    }
  });

  test("an OWNER may do both — the carve-out is a reservation, not a prohibition", () => {
    const asOwner = facts({ actorUserId: "the-owner", actorIsOwner: true });
    expect(decideMembershipChange({ role: "owner" }, asOwner)).toEqual({
      allowed: true,
      change: { role: "owner" },
    });
    expect(
      decideMembershipChange(
        { role: "counsellor" },
        facts({ actorUserId: "the-owner", actorIsOwner: true, targetCurrentRole: "owner", targetUserId: "other-owner" }),
      ),
    ).toEqual({ allowed: true, change: { role: "counsellor" } });
  });
});

describe("decideMembershipChange — the self-lockout guard", () => {
  test("no actor may change their own role or status, owner included", () => {
    // With F-2 (nobody can create an organization) and F-5 (nobody can invite),
    // an owner who deactivates themselves makes the org permanently unreachable
    // in-product. The database permits it; this surface does not offer it.
    const self = facts({ actorUserId: "same-person", targetUserId: "same-person" });
    const selfOwner = facts({
      actorUserId: "same-person",
      targetUserId: "same-person",
      actorIsOwner: true,
      targetCurrentRole: "owner",
    });
    for (const subject of [self, selfOwner]) {
      const decision = decideMembershipChange({ status: "inactive" }, subject);
      expect(decision.allowed).toBe(false);
      expect(decision).toMatchObject({ reason: "self-mutation" });
    }
  });
});

describe("decideMembershipChange — the payload is a closed set", () => {
  test("an empty change is refused rather than issued as a no-op UPDATE", () => {
    const decision = decideMembershipChange({}, facts());
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: "empty-change" });
  });

  test("a role or status the migration's check constraint does not define is refused", () => {
    // `organization_memberships.role` is check-constrained to owner/admin/counsellor
    // and `status` to active/inactive (20260730120000:60-61). 'student' is NOT a
    // membership role, however plausible it looks.
    expect(decideMembershipChange({ role: "student" }, facts())).toMatchObject({
      allowed: false,
      reason: "unknown-role",
    });
    expect(decideMembershipChange({ role: "superuser" }, facts())).toMatchObject({
      allowed: false,
      reason: "unknown-role",
    });
    expect(decideMembershipChange({ status: "pending" }, facts())).toMatchObject({
      allowed: false,
      reason: "unknown-status",
    });
  });

  test("the returned change carries ONLY role and status — the two granted columns", () => {
    // `grant update (role, status) on organization_memberships` (…:696). Anything
    // else in the SET list is 42501 at plan time, so the decision must not pass
    // extra keys through even if a caller supplied them.
    const decision = decideMembershipChange(
      { role: "admin", organization_id: "another-org", user_id: "someone-else" } as Record<string, string>,
      facts(),
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(Object.keys(decision.change).sort()).toEqual(["role"]);
    }
  });

  test("an unrecognised target role denies rather than being treated as non-owner", () => {
    // Schema drift must not read as "not an owner, so an admin may edit it".
    const decision = decideMembershipChange({ status: "inactive" }, facts({ targetCurrentRole: "superuser" }));
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: "unknown-role" });
  });
});
