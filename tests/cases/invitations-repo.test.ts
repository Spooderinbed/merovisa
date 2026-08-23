import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  STUDENT_INVITATION_ROLE,
  createStudentInvitation,
  deriveInvitationState,
  listCaseInvitations,
  normalizeInvitationEmail,
  revokeCaseInvitation,
} from "@/lib/cases/invitations-repo";
import { INVITATION_TTL_DAYS } from "@/lib/invitations/token";
import { fakeCaseDb, sawQuery, type CaseDbFixture } from "@/tests/helpers/fake-case-db";

/**
 * MV-193 — the invitation data layer (Stage 5 slice 1).
 *
 * The secrecy property has its own file (`tests/invitations/token-secrecy.test.ts`), which
 * was written first and is the point of the slice. This file covers the rest of the
 * acceptance criteria at the layer that can state them precisely:
 *
 *  * **criterion 2** — one row, `role = 'student'`, the case's id, the case's org,
 *    `invited_by` = the ACTUAL actor;
 *  * **criterion 6** — revoke stamps `revoked_at`, deletes nothing, and filters on BOTH ids;
 *  * **criterion 7** — a second invitation while one is outstanding is REFUSED.
 *
 * The two PostgREST rules every assertion is built on, both invisible in a happy path:
 *
 *  1. **A `42501` RESOLVES rather than rejects** — `throwOnError` has zero hits repo-wide,
 *     so a call site that does not destructure `error` drops the write and reports success.
 *  2. **A policy refusal is not an error** — Postgres reports it as zero rows affected, so
 *     an UPDATE must read its rows back or a refused write and a successful one are the
 *     same value.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSONAL = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const INVITATION = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-08-23T00:00:00.000Z");

function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      { id: CASE_A, organization_id: ORG_A },
      { id: CASE_B, organization_id: ORG_A },
      { id: PERSONAL, organization_id: null },
    ],
    invitations: [],
    ...overrides,
  };
}

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION,
    case_id: CASE_A,
    organization_id: ORG_A,
    email: "student@example.test",
    role: "student",
    token_hash: "digest",
    expires_at: "2099-01-01T00:00:00.000Z",
    accepted_at: null,
    revoked_at: null,
    invited_by: ACTOR,
    created_at: "2026-08-23T00:00:00.000Z",
    updated_at: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("createStudentInvitation — criterion 2, the row it writes", () => {
  test("writes exactly ONE row", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createStudentInvitation(ACTOR, CASE_A, "student@example.test", client, NOW);

    expect(inserts.filter((i) => i.table === "invitations")).toHaveLength(1);
  });

  test("stamps role=student, the case from the argument, and the case's own organization", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createStudentInvitation(ACTOR, CASE_A, "student@example.test", client, NOW);

    const row = inserts.find((i) => i.table === "invitations")!.row;
    expect(row.role).toBe(STUDENT_INVITATION_ROLE);
    expect(row.role).toBe("student");
    expect(row.case_id).toBe(CASE_A);
    // Read from the case, never accepted from a caller — `invitations_insert_staff` pins
    // it to `private.case_org_id(case_id)`, so a supplied value could only agree or 42501.
    expect(row.organization_id).toBe(ORG_A);
  });

  test("attributes invited_by to the ACTUAL actor", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createStudentInvitation(ACTOR, CASE_A, "student@example.test", client, NOW);

    expect(inserts.find((i) => i.table === "invitations")!.row.invited_by).toBe(ACTOR);
  });

  test("never names accepted_at — the column outside the grant that keeps acceptance server-only", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createStudentInvitation(ACTOR, CASE_A, "student@example.test", client, NOW);

    const row = inserts.find((i) => i.table === "invitations")!.row;
    // Naming it is a PLAN-TIME 42501, not a runtime refusal: the grant is
    // `update (revoked_at)` and `insert` carries no column list that includes it.
    expect(Object.keys(row)).not.toContain("accepted_at");
    expect(Object.keys(row)).not.toContain("revoked_at");
  });

  test("criterion 5 — the expiry is INVITATION_TTL_DAYS ahead of the clock it was given", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = new Date(inserts.find((i) => i.table === "invitations")!.row.expires_at as string);
    const days = (written.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBe(INVITATION_TTL_DAYS);
    // And the caller is told the same instant the row carries, so the UI cannot print a
    // different expiry from the one the database will enforce.
    expect(result.expiresAt).toBe(written.toISOString());
  });

  test("stores the address trimmed and lower-cased, so slice 2 can match it", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    await createStudentInvitation(ACTOR, CASE_A, "  Ram@Example.COM  ", client, NOW);

    expect(inserts.find((i) => i.table === "invitations")!.row.email).toBe("ram@example.com");
  });

  test("refuses a personal case by NAME rather than letting the policy say 'forbidden'", async () => {
    const { client, inserts } = fakeCaseDb(fixture());

    const result = await createStudentInvitation(ACTOR, PERSONAL, "s@example.test", client, NOW);

    expect(result).toEqual({ ok: false, reason: "not-an-org-case" });
    // And it never attempted the write: a personal case cannot carry a consultancy
    // invitation at all, so there is nothing for the database to refuse.
    expect(inserts.filter((i) => i.table === "invitations")).toHaveLength(0);
  });

  test("a case the actor cannot see is unknown-case, not an existence oracle", async () => {
    const { client } = fakeCaseDb(fixture({ cases: [] }));

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    expect(result).toEqual({ ok: false, reason: "unknown-case" });
  });

  test("a 42501 is DENIED and anything else is write-failed — they must not collapse", async () => {
    const denied = fakeCaseDb(fixture(), {
      insertError: { invitations: { code: "42501", message: "permission denied" } },
    });
    const broken = fakeCaseDb(fixture(), {
      insertError: { invitations: { code: "08006", message: "connection failure" } },
    });

    // One means "ask someone", the other means "try again". A single reason would send
    // half the callers to the wrong place.
    await expect(
      createStudentInvitation(ACTOR, CASE_A, "s@example.test", denied.client, NOW),
    ).resolves.toEqual({ ok: false, reason: "denied" });
    await expect(
      createStudentInvitation(ACTOR, CASE_A, "s@example.test", broken.client, NOW),
    ).resolves.toEqual({ ok: false, reason: "write-failed" });
  });

  test("a blank actor or case earns no query at all", async () => {
    const { client, queries } = fakeCaseDb(fixture());

    await expect(
      createStudentInvitation("", CASE_A, "s@example.test", client, NOW),
    ).resolves.toEqual({ ok: false, reason: "invalid-input" });
    await expect(createStudentInvitation(ACTOR, "", "s@example.test", client, NOW)).resolves.toEqual(
      { ok: false, reason: "invalid-input" },
    );
    await expect(createStudentInvitation(ACTOR, CASE_A, "   ", client, NOW)).resolves.toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(queries).toHaveLength(0);
  });
});

describe("createStudentInvitation — criterion 7, no silent duplicate", () => {
  test("REFUSES while an invitation is outstanding, and writes nothing", async () => {
    const { client, inserts } = fakeCaseDb(fixture({ invitations: [invitationRow()] }));

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    // The card offers "refuse" or "revoke in the same transaction" and requires one to be
    // picked. This slice REFUSES, because the alternative is not available: PostgREST gives
    // one statement per request, so a revoke-then-mint is two round trips, and a revoke that
    // succeeds followed by a mint that fails leaves the case with NO usable invitation and a
    // counsellor who believes they just sent one. Getting both under one commit needs a
    // database function — a migration, which criterion 8 forbids.
    expect(result).toEqual({ ok: false, reason: "already-outstanding" });
    expect(inserts.filter((i) => i.table === "invitations")).toHaveLength(0);
  });

  test("ALLOWS a fresh invitation once the previous one is revoked", async () => {
    const { client } = fakeCaseDb(
      fixture({ invitations: [invitationRow({ revoked_at: "2026-08-22T00:00:00.000Z" })] }),
    );

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    expect(result.ok).toBe(true);
  });

  test("ALLOWS a fresh invitation once the previous one has EXPIRED", async () => {
    const { client } = fakeCaseDb(
      fixture({ invitations: [invitationRow({ expires_at: "2026-08-01T00:00:00.000Z" })] }),
    );

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    expect(result.ok).toBe(true);
  });

  test("an ACCEPTED invitation does not block one either — that case is linked and drops the panel", async () => {
    const { client } = fakeCaseDb(
      fixture({ invitations: [invitationRow({ accepted_at: "2026-08-22T00:00:00.000Z" })] }),
    );

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    expect(result.ok).toBe(true);
  });

  test("another CASE's outstanding invitation does not block this one", async () => {
    const { client } = fakeCaseDb(
      fixture({ invitations: [invitationRow({ id: "other", case_id: CASE_B })] }),
    );

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    expect(result.ok).toBe(true);
  });

  test("a FAILED outstanding-check refuses the mint rather than guessing there is none", async () => {
    const { client, inserts } = fakeCaseDb(fixture(), {
      errorOn: { invitations: { message: "read failed" } },
    });

    const result = await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    // "We could not tell" must never render as "there is none". Minting on a failed read
    // is exactly how a student ends up holding two live links.
    expect(result).toEqual({ ok: false, reason: "write-failed" });
    expect(inserts.filter((i) => i.table === "invitations")).toHaveLength(0);
  });

  test("does NOT look the email up against existing accounts — the collision stays open", async () => {
    const { client, queries } = fakeCaseDb(fixture());

    await createStudentInvitation(ACTOR, CASE_A, "s@example.test", client, NOW);

    // A student who used the self-serve product already has a PERSONAL case. Refusing to
    // invite a known address, or merging anything, would silently pick an answer to Stage
    // 5's "without duplication" question that the founder has not taken. Nothing here reads
    // `auth.users`, and nothing assumes one case per human.
    expect(queries.map((q) => q.table)).not.toContain("users");
    expect(queries.map((q) => q.table)).not.toContain("auth.users");
  });
});

describe("revokeCaseInvitation — criterion 6", () => {
  test("stamps revoked_at and writes NOTHING else", async () => {
    const { client, updates } = fakeCaseDb(fixture({ invitations: [invitationRow()] }));

    const result = await revokeCaseInvitation(INVITATION, CASE_A, client, NOW);

    expect(result).toEqual({ ok: true });
    const patch = updates.find((u) => u.table === "invitations")!.patch;
    // The ONE column in the grant. `updated_at` is a TRIGGER's job and naming it here
    // would make every revoke a plan-time 42501.
    expect(Object.keys(patch)).toEqual(["revoked_at"]);
    expect(patch.revoked_at).toBe(NOW.toISOString());
  });

  test("DELETES nothing — a revoked invitation is still a record of who was invited", async () => {
    const { client, deletes, rows } = fakeCaseDb(fixture({ invitations: [invitationRow()] }));

    await revokeCaseInvitation(INVITATION, CASE_A, client, NOW);

    // MV-152 shipped no DELETE policy on `invitations` at all, and said why.
    expect(deletes).toHaveLength(0);
    expect(rows.invitations).toHaveLength(1);
  });

  test("filters on BOTH the invitation id and the case — spec F-8", async () => {
    const { client, queries } = fakeCaseDb(fixture({ invitations: [invitationRow()] }));

    await revokeCaseInvitation(INVITATION, CASE_A, client, NOW);

    expect(sawQuery(queries, "invitations", [["id", INVITATION], ["case_id", CASE_A]])).toBe(true);
  });

  test("an invitation id from ANOTHER case is refused under this case's authorization", async () => {
    const { client, rows } = fakeCaseDb(
      fixture({ invitations: [invitationRow({ case_id: CASE_B })] }),
    );

    const result = await revokeCaseInvitation(INVITATION, CASE_A, client, NOW);

    // Without the `case_id` predicate the id alone would decide which row moves — a
    // counsellor may legitimately staff both cases, so RLS cannot catch this one.
    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(rows.invitations![0]!.revoked_at).toBeNull();
  });

  test("zero rows is DENIED, never a silent success", async () => {
    const { client } = fakeCaseDb(fixture({ invitations: [] }));

    // A policy refusal is not an error: Postgres reports it as zero rows affected. A
    // repository that did not read its rows back would return `ok` here.
    await expect(revokeCaseInvitation(INVITATION, CASE_A, client, NOW)).resolves.toEqual({
      ok: false,
      reason: "denied",
    });
  });

  test("a 42501 is DENIED and anything else is write-failed", async () => {
    const denied = fakeCaseDb(fixture({ invitations: [invitationRow()] }), {
      updateError: { invitations: { code: "42501", message: "permission denied" } },
    });
    const broken = fakeCaseDb(fixture({ invitations: [invitationRow()] }), {
      updateError: { invitations: { code: "08006", message: "connection failure" } },
    });

    await expect(revokeCaseInvitation(INVITATION, CASE_A, denied.client, NOW)).resolves.toEqual({
      ok: false,
      reason: "denied",
    });
    await expect(revokeCaseInvitation(INVITATION, CASE_A, broken.client, NOW)).resolves.toEqual({
      ok: false,
      reason: "write-failed",
    });
  });
});

describe("listCaseInvitations", () => {
  test("reads only the invitations of the case it was handed, and filters at the DATABASE", async () => {
    const { client, queries } = fakeCaseDb(
      fixture({
        invitations: [invitationRow({ id: "mine" }), invitationRow({ id: "theirs", case_id: CASE_B })],
      }),
    );

    const result = await listCaseInvitations(CASE_A, client, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((row) => row.id)).toEqual(["mine"]);
    // A FILTER, not a post-read discard: a repository that read the table unfiltered and
    // dropped the wrong rows in memory would pass the assertion above while shipping
    // another case's student emails over the wire.
    expect(sawQuery(queries, "invitations", [["case_id", CASE_A]])).toBe(true);
  });

  test("a failed read is an OUTAGE, never an empty list", async () => {
    const { client } = fakeCaseDb(fixture(), {
      errorOn: { invitations: { message: "read failed" } },
    });

    // "We could not find out" and "nobody has been invited" are different sentences and
    // only one of them is true. Rendering the second is how a second link gets minted.
    await expect(listCaseInvitations(CASE_A, client, NOW)).resolves.toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  test("orders newest first, so the invitation that matters leads", async () => {
    const { client, queries } = fakeCaseDb(fixture({ invitations: [invitationRow()] }));

    await listCaseInvitations(CASE_A, client, NOW);

    const read = queries.find((q) => q.table === "invitations")!;
    expect(read.order).toContainEqual(["created_at", { ascending: false }]);
  });
});

describe("deriveInvitationState — four states from three timestamps", () => {
  const base = { expires_at: "2099-01-01T00:00:00.000Z", accepted_at: null, revoked_at: null };

  test("outstanding while unaccepted, unrevoked and unexpired", () => {
    expect(deriveInvitationState(base, NOW)).toBe("outstanding");
  });

  test("expired once the clock passes expires_at", () => {
    expect(deriveInvitationState({ ...base, expires_at: "2026-08-01T00:00:00.000Z" }, NOW)).toBe(
      "expired",
    );
  });

  test("accepted outranks expired — a taken-up invitation stays taken up", () => {
    expect(
      deriveInvitationState(
        { expires_at: "2026-08-01T00:00:00.000Z", accepted_at: "2026-07-30T00:00:00.000Z", revoked_at: null },
        NOW,
      ),
    ).toBe("accepted");
  });

  test("revoked outranks everything", () => {
    expect(
      deriveInvitationState(
        { expires_at: "2099-01-01T00:00:00.000Z", accepted_at: "2026-07-30T00:00:00.000Z", revoked_at: "2026-08-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("revoked");
  });

  test("an unparseable expiry is EXPIRED, never outstanding", () => {
    // The column is `not null timestamptz`, so this cannot arrive from the database. If it
    // ever did, calling a credential of unknown lifetime "outstanding" is the one reading
    // that keeps a link alive on a guess.
    expect(deriveInvitationState({ ...base, expires_at: "not a date" }, NOW)).toBe("expired");
  });

  test("the boundary is inclusive — an invitation expiring exactly now is expired", () => {
    expect(deriveInvitationState({ ...base, expires_at: NOW.toISOString() }, NOW)).toBe("expired");
  });
});

describe("normalizeInvitationEmail", () => {
  test("trims and lower-cases", () => {
    expect(normalizeInvitationEmail("  Ram@Example.COM ")).toBe("ram@example.com");
  });

  test("a blank address is null, not an empty string", () => {
    expect(normalizeInvitationEmail("   ")).toBeNull();
    expect(normalizeInvitationEmail("")).toBeNull();
  });
});
