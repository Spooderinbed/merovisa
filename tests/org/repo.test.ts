import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  listActorOrganizations,
  listOrgMembers,
  getOrgMembership,
  renameOrganization,
  applyMembershipChange,
} from "@/lib/org/repo";
import { fakeCaseDb, sawQuery } from "@/tests/helpers/fake-case-db";

/**
 * The data half of access-matrix cells 1, 2, 4 and 5 (spec §4).
 *
 * These run against an in-memory fake. They prove this layer's SEMANTICS — what
 * it asks for, and what it does with what comes back. They are categorically
 * incapable of proving the database denies a cross-tenant read
 * (`lib/cases/README.md` §"The SQL half is not optional"); that half is pinned by
 * `tests/integration/case-rls.itest.ts`, which this slice does not touch.
 *
 * The property they DO prove, and which a green integration suite would not
 * catch: this layer never reports a refused write as a success. Two shapes of
 * refusal exist and they look nothing alike —
 *
 *   - a COLUMN-GRANT violation raises `42501`, which supabase-js RESOLVES rather
 *     than rejects, so a call site that does not destructure `error` drops the
 *     write silently;
 *   - a POLICY refusal is not an error at all: Postgres reports it as zero rows
 *     affected, so even a call site that checks `error` reads it as success.
 *
 * The second is the one that survives review, so it gets its own test per verb.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ORG_INACTIVE = "33333333-3333-4333-8333-333333333333";
const ACTOR = "actor-user-id";

describe("listActorOrganizations — cell 1, org selection", () => {
  test("returns every organization the actor is an ACTIVE member of, with their role", async () => {
    const { client } = fakeCaseDb({
      organization_memberships: [
        { id: "m-b", organization_id: ORG_B, user_id: ACTOR, role: "counsellor", status: "active" },
        { id: "m-a", organization_id: ORG_A, user_id: ACTOR, role: "owner", status: "active" },
      ],
      organizations: [
        { id: ORG_A, name: "Anadi Education", slug: "anadi" },
        { id: ORG_B, name: "Bagmati Overseas", slug: "bagmati" },
      ],
    });

    const result = await listActorOrganizations(ACTOR, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Sorted by name so the selection surface is stable between renders.
    expect(result.data).toEqual([
      { id: ORG_A, name: "Anadi Education", slug: "anadi", role: "owner" },
      { id: ORG_B, name: "Bagmati Overseas", slug: "bagmati", role: "counsellor" },
    ]);
  });

  test("an INACTIVE membership contributes nothing — cell 1's `I = ∅`", async () => {
    // Not a test of absence: the membership row EXISTS and the organization row is
    // readable in the fixture. The only thing that can exclude it is this layer
    // filtering on the active status — which is required because
    // `organization_memberships_select_member` deliberately still shows an
    // inactive member their OWN row (…:351).
    const { client } = fakeCaseDb({
      organization_memberships: [
        { id: "m-a", organization_id: ORG_A, user_id: ACTOR, role: "admin", status: "active" },
        { id: "m-x", organization_id: ORG_INACTIVE, user_id: ACTOR, role: "owner", status: "inactive" },
      ],
      organizations: [
        { id: ORG_A, name: "Anadi Education", slug: "anadi" },
        { id: ORG_INACTIVE, name: "Revoked Consultancy", slug: "revoked" },
      ],
    });

    const result = await listActorOrganizations(ACTOR, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((org) => org.id)).toEqual([ORG_A]);
  });

  test("an organization the actor cannot READ is dropped, even with a membership row", async () => {
    // Fail-closed: RLS is the lock. If `organizations` did not return the row, the
    // membership row alone must not conjure a workspace entry.
    const { client } = fakeCaseDb({
      organization_memberships: [
        { id: "m-a", organization_id: ORG_A, user_id: ACTOR, role: "owner", status: "active" },
      ],
      organizations: [],
    });

    const result = await listActorOrganizations(ACTOR, client);
    expect(result).toEqual({ ok: true, data: [] });
  });

  test("a lookup failure is reported as a failure, NOT as an empty list", async () => {
    // "You belong to no organization" and "the database did not answer" must not
    // render identically — the first is a true statement about the actor.
    for (const table of ["organization_memberships", "organizations"] as const) {
      const { client } = fakeCaseDb(
        {
          organization_memberships: [
            { id: "m-a", organization_id: ORG_A, user_id: ACTOR, role: "owner", status: "active" },
          ],
          organizations: [{ id: ORG_A, name: "Anadi Education", slug: "anadi" }],
        },
        { errorOn: { [table]: { message: "boom" } } },
      );
      expect(await listActorOrganizations(ACTOR, client), table).toEqual({
        ok: false,
        reason: "lookup-failed",
      });
    }
  });

  test("a thrown client denies rather than escaping to the caller", async () => {
    const { client } = fakeCaseDb({}, { throwOn: ["organization_memberships"] });
    expect(await listActorOrganizations(ACTOR, client)).toEqual({ ok: false, reason: "lookup-failed" });
  });

  test("a blank actor id earns no query at all", async () => {
    const { client, queries } = fakeCaseDb({});
    expect(await listActorOrganizations("   ", client)).toEqual({ ok: false, reason: "lookup-failed" });
    expect(queries).toEqual([]);
  });
});

describe("listOrgMembers — cell 4, the team list", () => {
  test("returns the memberships of the named organization, verbatim", async () => {
    const { client, queries } = fakeCaseDb({
      organization_memberships: [
        { id: "m-1", organization_id: ORG_A, user_id: "u-1", role: "owner", status: "active" },
        { id: "m-2", organization_id: ORG_A, user_id: "u-2", role: "counsellor", status: "inactive" },
        { id: "m-3", organization_id: ORG_B, user_id: "u-3", role: "admin", status: "active" },
      ],
    });

    const result = await listOrgMembers(ORG_A, client);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      { id: "m-1", userId: "u-1", role: "owner", status: "active" },
      { id: "m-2", userId: "u-2", role: "counsellor", status: "inactive" },
    ]);
    expect(sawQuery(queries, "organization_memberships", [["organization_id", ORG_A]])).toBe(true);
  });

  test("an inactive member is LISTED — deactivating is not deleting", async () => {
    // `status = 'inactive'` is the revocation switch and the row survives for the
    // audit trail (20260730120000:52-55). A team list that hid them would make a
    // deactivation look like a deletion to the admin who performed it.
    const { client } = fakeCaseDb({
      organization_memberships: [
        { id: "m-2", organization_id: ORG_A, user_id: "u-2", role: "counsellor", status: "inactive" },
      ],
    });
    const result = await listOrgMembers(ORG_A, client);
    expect(result.ok && result.data).toHaveLength(1);
  });

  test("a lookup failure is a failure, not an empty team", async () => {
    const { client } = fakeCaseDb({}, { errorOn: { organization_memberships: { message: "boom" } } });
    expect(await listOrgMembers(ORG_A, client)).toEqual({ ok: false, reason: "lookup-failed" });
  });
});

describe("getOrgMembership — the row a change is decided against", () => {
  test("is scoped to the organization in the URL, not to the membership id alone", async () => {
    // Defense in depth against an id from another tenant: RLS would refuse the
    // UPDATE anyway, but resolving the row cross-org first would let the app layer
    // decide against a role from the wrong organization.
    const { client, queries } = fakeCaseDb({
      organization_memberships: [
        { id: "m-3", organization_id: ORG_B, user_id: "u-3", role: "admin", status: "active" },
      ],
    });

    const result = await getOrgMembership(ORG_A, "m-3", client);

    expect(result).toEqual({ ok: true, data: null });
    expect(
      sawQuery(queries, "organization_memberships", [
        ["organization_id", ORG_A],
        ["id", "m-3"],
      ]),
    ).toBe(true);
  });

  test("resolves the row when it belongs to the organization", async () => {
    const { client } = fakeCaseDb({
      organization_memberships: [
        { id: "m-2", organization_id: ORG_A, user_id: "u-2", role: "counsellor", status: "active" },
      ],
    });
    expect(await getOrgMembership(ORG_A, "m-2", client)).toEqual({
      ok: true,
      data: { id: "m-2", userId: "u-2", role: "counsellor", status: "active" },
    });
  });
});

describe("applyMembershipChange — cell 5's write", () => {
  const seed = () =>
    fakeCaseDb({
      organization_memberships: [
        { id: "m-2", organization_id: ORG_A, user_id: "u-2", role: "counsellor", status: "active" },
      ],
    });

  test("writes only the granted columns, scoped to the org and the row", async () => {
    const { client, updates, queries } = seed();

    expect(await applyMembershipChange(ORG_A, "m-2", { role: "admin" }, client)).toEqual({ ok: true });

    // `grant update (role, status)` (…:696) — a SET list carrying anything else is
    // 42501 at plan time for the whole statement.
    expect(updates).toEqual([{ table: "organization_memberships", patch: { role: "admin" } }]);
    expect(
      sawQuery(queries, "organization_memberships", [
        ["organization_id", ORG_A],
        ["id", "m-2"],
      ]),
    ).toBe(true);
  });

  test("a POLICY refusal — zero rows affected, no error — is reported as DENIED", async () => {
    // The defect this exists to catch: an RLS-refused UPDATE is not an error.
    // Checking `error` alone reports success and the UI says "saved" while nothing
    // changed. The row here does not match the filters, which is exactly what the
    // database does when the policy excludes it.
    const { client } = fakeCaseDb({ organization_memberships: [] });
    expect(await applyMembershipChange(ORG_A, "m-2", { status: "inactive" }, client)).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("a 42501 column-grant violation is reported as DENIED, never dropped", async () => {
    const { client } = seed();
    const denied = fakeCaseDb(
      { organization_memberships: [{ id: "m-2", organization_id: ORG_A, user_id: "u-2", role: "counsellor", status: "active" }] },
      { updateError: { organization_memberships: { code: "42501", message: "permission denied for table" } } },
    );
    expect(await applyMembershipChange(ORG_A, "m-2", { role: "admin" }, denied.client)).toEqual({
      ok: false,
      reason: "denied",
    });
    // and the happy path still works, so the assertion above is not vacuous
    expect(await applyMembershipChange(ORG_A, "m-2", { role: "admin" }, client)).toEqual({ ok: true });
  });

  test("any other database error is a write failure, distinguishable from a denial", async () => {
    const { client } = fakeCaseDb(
      { organization_memberships: [{ id: "m-2", organization_id: ORG_A, user_id: "u-2", role: "counsellor", status: "active" }] },
      { updateError: { organization_memberships: { code: "08006", message: "connection failure" } } },
    );
    expect(await applyMembershipChange(ORG_A, "m-2", { role: "admin" }, client)).toEqual({
      ok: false,
      reason: "write-failed",
    });
  });
});

describe("renameOrganization — cell 2's write", () => {
  const seed = () => fakeCaseDb({ organizations: [{ id: ORG_A, name: "Anadi Education", slug: "anadi" }] });

  test("writes only name and slug, scoped to the organization", async () => {
    const { client, updates, queries } = seed();

    expect(await renameOrganization(ORG_A, { name: "Anadi Global", slug: "anadi-global" }, client)).toEqual({
      ok: true,
    });

    expect(updates).toEqual([
      { table: "organizations", patch: { name: "Anadi Global", slug: "anadi-global" } },
    ]);
    expect(sawQuery(queries, "organizations", [["id", ORG_A]])).toBe(true);
  });

  test("a partial rename sends only the field it was given", async () => {
    const { client, updates } = seed();
    await renameOrganization(ORG_A, { name: "Anadi Global" }, client);
    expect(updates).toEqual([{ table: "organizations", patch: { name: "Anadi Global" } }]);
  });

  test("an admin's refused rename — zero rows, no error — is DENIED, not saved", async () => {
    // `organizations_update_owner` is owner-only (divergence #1). An admin's
    // request matches no row; without a read-back this returns "saved".
    const { client } = fakeCaseDb({ organizations: [] });
    expect(await renameOrganization(ORG_A, { name: "Anadi Global" }, client)).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("a slug already taken is its own outcome, not a generic failure", async () => {
    // `slug text not null unique` (20260730120000:41) — Zod cannot catch this and
    // the owner needs to be told which field to change.
    const { client } = fakeCaseDb(
      { organizations: [{ id: ORG_A, name: "Anadi Education", slug: "anadi" }] },
      { updateError: { organizations: { code: "23505", message: "duplicate key value" } } },
    );
    expect(await renameOrganization(ORG_A, { slug: "taken" }, client)).toEqual({
      ok: false,
      reason: "slug-taken",
    });
  });

  test("an empty patch is refused rather than issued as a no-op UPDATE", async () => {
    const { client, updates } = seed();
    expect(await renameOrganization(ORG_A, {}, client)).toEqual({ ok: false, reason: "write-failed" });
    expect(updates).toEqual([]);
  });
});
