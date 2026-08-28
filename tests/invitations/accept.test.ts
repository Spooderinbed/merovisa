import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashInvitationToken, mintInvitationToken } from "@/lib/invitations/token";
import {
  linkCaseToStudent,
  redeemInvitationToken,
  INVITATION_ACCEPT_ENTITY_TYPE,
} from "@/lib/invitations/accept";
import { fakeCaseDb, type CaseDbFixture, type RecordedQuery } from "@/tests/helpers/fake-case-db";

/**
 * MV-194 — the compare-and-swap, at the unit level (Stage 5 slice 2).
 *
 * MV-150 wrote the mechanism down in the schema three stages before this slice existed:
 *
 *   > `unique (token_hash)` is what makes the atomic compare-and-swap acceptance
 *   > enforceable — one statement setting `accepted_at` where the hash matches AND
 *   > `accepted_at is null` AND `revoked_at is null` AND `expires_at > now()`, with the
 *   > affected row count deciding success.
 *
 * The exit gate's four words map one-to-one onto those four predicates — **mismatch** onto
 * the hash, **replay** onto `accepted_at is null`, **revocation** onto `revoked_at is null`,
 * **expiry** onto `expires_at > now()` — which is what makes the gate mutation-testable:
 * dropping any one predicate must turn a DIFFERENT named test red. If two mutants kill the
 * same set, the four words are not independently covered and the gate is weaker than it
 * reads. `supabase/rehearsal/MV-194-mutation.sql` records the measured run.
 *
 * ## What this file can prove and what it cannot
 *
 * It proves the SHAPE — that all the predicates ride in one statement rather than being
 * checked in JavaScript around a wider one, that the swap is the FIRST thing that touches
 * the row, and how each refusal is named. It cannot prove Postgres agrees; that is
 * `tests/integration/stage5-invitations.itest.ts`, which races two acceptances against a
 * real unique index and asserts exactly one winner.
 *
 * The distinction matters more here than usual: an implementation that read the row, checked
 * the four conditions in TypeScript and then updated by `id` would pass every behavioural
 * assertion below and lose the atomicity entirely. The predicate-shape tests are what
 * refuse it.
 */

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVITATION_A = "33333333-3333-4333-8333-333333333333";
const STUDENT = "99999999-9999-4999-8999-999999999999";
const OTHER_STUDENT = "88888888-8888-4888-8888-888888888888";
const EMAIL = "student@example.test";

const NOW = new Date("2026-08-24T10:00:00.000Z");
const FUTURE = "2026-08-31T10:00:00.000Z";
const PAST = "2026-08-17T10:00:00.000Z";

interface InvitationOverrides {
  id?: string;
  case_id?: string;
  organization_id?: string | null;
  email?: string;
  role?: string;
  expires_at?: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
}

/** One outstanding student invitation on `CASE_A`, plus the unlinked case it names. */
function fixture(
  token: string,
  invitation: InvitationOverrides = {},
  cases?: CaseDbFixture["cases"],
): CaseDbFixture {
  return {
    cases: cases ?? [{ id: CASE_A, organization_id: ORG_A, student_user_id: null }],
    invitations: [
      {
        id: INVITATION_A,
        case_id: CASE_A,
        organization_id: ORG_A,
        email: EMAIL,
        role: "student",
        token_hash: hashOf(token),
        expires_at: FUTURE,
        accepted_at: null,
        revoked_at: null,
        ...invitation,
      },
    ],
  };
}

/**
 * Hashed through the product's own function rather than a literal, so a fixture cannot
 * drift from the digest the implementation will compute.
 */
function hashOf(token: string): string {
  return hashInvitationToken(token);
}

const redeem = (
  db: Parameters<typeof redeemInvitationToken>[0],
  token: string,
  overrides: { actorUserId?: string; actorEmail?: string; now?: Date } = {},
) =>
  redeemInvitationToken(db, {
    token,
    actorUserId: overrides.actorUserId ?? STUDENT,
    actorEmail: overrides.actorEmail ?? EMAIL,
    now: overrides.now ?? NOW,
  });

/** The one query that carried an UPDATE on `invitations` — the compare-and-swap itself. */
function swapQuery(queries: RecordedQuery[]): RecordedQuery | undefined {
  return queries.find((query) => query.table === "invitations" && query.select.length > 0 && hasSwapFilters(query));
}

function hasSwapFilters(query: RecordedQuery): boolean {
  return query.filters.some(([column]) => column === "token_hash") && query.comparisons.length > 0;
}

// =======================================================================================
// The statement itself — the property no behavioural assertion can see
// =======================================================================================
describe("MV-194 — the acceptance is ONE compare-and-swap, not four checks around an update", () => {
  test("all four gate predicates ride in the same statement as the write", async () => {
    const { token } = mintInvitationToken();
    const { client, queries, updates } = fakeCaseDb(fixture(token));

    await redeem(client, token);

    const swap = swapQuery(queries);
    expect(swap, "no compare-and-swap statement was issued").toBeDefined();

    // MISMATCH — the hash lookup.
    expect(swap!.filters).toContainEqual(["token_hash", hashOf(token)]);
    // REPLAY.
    expect(swap!.filters).toContainEqual(["accepted_at", null]);
    // REVOCATION.
    expect(swap!.filters).toContainEqual(["revoked_at", null]);
    // EXPIRY — an inequality, and it must be a filter rather than a JavaScript comparison
    // after the fact: an expiry checked afterwards has already accepted the invitation.
    expect(swap!.comparisons).toContainEqual(["expires_at", "gt", NOW.toISOString()]);

    // And the write it carries is exactly the one column acceptance means.
    const patch = updates.find((update) => update.table === "invitations");
    expect(patch, "the swap wrote nothing").toBeDefined();
    expect(Object.keys(patch!.patch)).toEqual(["accepted_at"]);
  });

  test("the address check rides in the SAME statement — decision A cannot be bypassed by a race", async () => {
    const { token } = mintInvitationToken();
    const { client, queries } = fakeCaseDb(fixture(token));

    await redeem(client, token);

    expect(swapQuery(queries)!.filters).toContainEqual(["email", EMAIL]);
  });

  test("only a STUDENT invitation is redeemable here — a team token is a different authority", async () => {
    const { token } = mintInvitationToken();
    const { client, queries } = fakeCaseDb(fixture(token));

    await redeem(client, token);

    expect(swapQuery(queries)!.filters).toContainEqual(["role", "student"]);
  });

  test("the swap is the FIRST statement — nothing reads the invitation before it decides", async () => {
    const { token } = mintInvitationToken();
    const { client, queries } = fakeCaseDb(fixture(token));

    await redeem(client, token);

    // A pre-read that refused on `accepted_at` / `revoked_at` / `expires_at` before the
    // swap would make three of the four predicates dead code: the swap would never be
    // reached in the states they exist to refuse, every mutant on them would survive, and
    // the gate would read as enforced while being enforced nowhere.
    const first = queries[0];
    expect(first, "no query was issued at all").toBeDefined();
    expect(first!.table).toBe("invitations");
    expect(hasSwapFilters(first!), "the first statement was a read, not the swap").toBe(true);
  });

  test("the swap never PROJECTS token_hash — it filters on the digest and reads back ids", async () => {
    const { token } = mintInvitationToken();
    const { client, queries } = fakeCaseDb(fixture(token));

    await redeem(client, token);

    const projections = queries.filter((q) => q.table === "invitations").flatMap((q) => q.select);
    expect(projections.length, "no projection was recorded — the sweep sees nothing").toBeGreaterThan(0);
    for (const projection of projections) {
      expect(projection).not.toContain("token_hash");
      expect(projection).not.toBe("*");
    }
  });
});

// =======================================================================================
// The winner
// =======================================================================================
describe("MV-194 criterion 1 — a valid token, a matching address, an unlinked case", () => {
  test("redeems, and reports the case and organization the audit row needs", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(fixture(token));

    const result = await redeem(client, token);

    expect(result.ok, `refused: ${(result as { reason?: string }).reason}`).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("redeemed");
    if (result.outcome !== "redeemed") return;
    expect(result.invitationId).toBe(INVITATION_A);
    expect(result.caseId).toBe(CASE_A);
    expect(result.organizationId).toBe(ORG_A);
  });

  test("stamps accepted_at with the clock it was given", async () => {
    const { token } = mintInvitationToken();
    const { client, rows } = fakeCaseDb(fixture(token));

    await redeem(client, token);

    expect(rows.invitations![0]!.accepted_at).toBe(NOW.toISOString());
  });

  test("the entity type is the one MV-189's writer already knows", () => {
    // A uuid entity id and a stable entity type are what keep an audit row joinable.
    expect(INVITATION_ACCEPT_ENTITY_TYPE).toBe("invitation");
  });
});

// =======================================================================================
// The four refusals, each distinguishable — criterion 4
// =======================================================================================
describe("MV-194 criteria 2-4 — the four gate words, each with its own name", () => {
  test("REPLAY by a different account: refused, and the first acceptance is untouched", async () => {
    const { token } = mintInvitationToken();
    const stamped = "2026-08-20T09:00:00.000Z";
    const { client, rows } = fakeCaseDb(
      fixture(
        token,
        { accepted_at: stamped, email: "first@example.test" },
        [{ id: CASE_A, organization_id: ORG_A, student_user_id: OTHER_STUDENT }],
      ),
    );

    const result = await redeem(client, token, { actorEmail: "second@example.test" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The address check fires first for a different ACCOUNT — one Auth account holds one
    // address, so "a different account" and "a different address" are the same population.
    // The replay predicate is proven independently by the no-re-stamp test below and by the
    // raced acceptance in the integration suite.
    expect(result.reason).toBe("email-mismatch");
    expect(rows.invitations![0]!.accepted_at, "the first acceptance was re-stamped").toBe(stamped);
    expect(rows.cases![0]!.student_user_id, "the first student was evicted").toBe(OTHER_STUDENT);
  });

  test("REPLAY, address matching, case linked elsewhere: `already-accepted`", async () => {
    const { token } = mintInvitationToken();
    const stamped = "2026-08-20T09:00:00.000Z";
    const { client, rows } = fakeCaseDb(
      fixture(token, { accepted_at: stamped }, [
        { id: CASE_A, organization_id: ORG_A, student_user_id: OTHER_STUDENT },
      ]),
    );

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already-accepted");
    expect(rows.invitations![0]!.accepted_at).toBe(stamped);
  });

  test("REVOCATION: refused, including a token revoked after minting and before acceptance", async () => {
    const { token } = mintInvitationToken();
    const { client, rows } = fakeCaseDb(
      fixture(token, { revoked_at: "2026-08-22T09:00:00.000Z" }),
    );

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("revoked");
    expect(rows.invitations![0]!.accepted_at, "a revoked invitation was accepted").toBeNull();
  });

  test("EXPIRY: a token past expires_at is refused, and is not burned by the attempt", async () => {
    const { token } = mintInvitationToken();
    const { client, rows } = fakeCaseDb(fixture(token, { expires_at: PAST }));

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("expired");
    expect(rows.invitations![0]!.accepted_at).toBeNull();
  });

  test("MISMATCH: a token nothing minted is refused, and writes nothing", async () => {
    const { token } = mintInvitationToken();
    const { token: strangerToken } = mintInvitationToken();
    const { client, rows, updates } = fakeCaseDb(fixture(token));

    const result = await redeem(client, strangerToken);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid-token");
    expect(rows.invitations![0]!.accepted_at, "an unrelated invitation was consumed").toBeNull();
    expect(updates.filter((u) => u.table === "cases")).toEqual([]);
  });

  test("MISMATCH: a TEAM invitation token is not redeemable on the student path", async () => {
    const { token } = mintInvitationToken();
    const { client, rows } = fakeCaseDb(fixture(token, { role: "counsellor" }));

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Not a distinct reason: telling the holder of a team token WHICH kind of invitation
    // they hold is a disclosure with no action behind it, and team acceptance is a
    // different authority and a different blast radius (card, Scope — out).
    expect(result.reason).toBe("invalid-token");
    expect(rows.invitations![0]!.accepted_at).toBeNull();
  });

  test("every refusal is a DIFFERENT name — a single 'this link does not work' is untestable", async () => {
    const seen = new Set<string>();
    const cases: Array<[InvitationOverrides, string | undefined]> = [
      [{ expires_at: PAST }, undefined],
      [{ revoked_at: "2026-08-22T09:00:00.000Z" }, undefined],
      [{ accepted_at: "2026-08-20T09:00:00.000Z" }, undefined],
      [{}, "somebody.else@example.test"],
    ];
    for (const [overrides, actorEmail] of cases) {
      const { token } = mintInvitationToken();
      const { client } = fakeCaseDb(
        fixture(token, overrides, [
          { id: CASE_A, organization_id: ORG_A, student_user_id: OTHER_STUDENT },
        ]),
      );
      const result = await redeem(client, token, actorEmail ? { actorEmail } : {});
      expect(result.ok).toBe(false);
      if (result.ok) return;
      seen.add(result.reason);
    }
    expect([...seen].sort()).toEqual(["already-accepted", "email-mismatch", "expired", "revoked"]);
  });
});

// =======================================================================================
// Decision A — the address, normalised conservatively
// =======================================================================================
describe("MV-194 decision A — the invited address must match the signed-in account", () => {
  test("case and surrounding whitespace do not matter", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(fixture(token));

    const result = await redeem(client, token, { actorEmail: "  Student@Example.TEST  " });

    expect(result.ok, `a case-folded address was refused: ${(result as { reason?: string }).reason}`).toBe(true);
  });

  test("Gmail dots are NOT stripped — address canonicalisation is a spoofing surface", async () => {
    const { token } = mintInvitationToken();
    const { client, rows } = fakeCaseDb(fixture(token, { email: "ram.bahadur@gmail.com" }));

    const result = await redeem(client, token, { actorEmail: "rambahadur@gmail.com" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("email-mismatch");
    expect(rows.invitations![0]!.accepted_at).toBeNull();
  });

  test("a `+tag` is NOT stripped either", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(fixture(token, { email: "ram+consultancy@gmail.com" }));

    const result = await redeem(client, token, { actorEmail: "ram@gmail.com" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("email-mismatch");
  });

  test("a wrong address does NOT burn the token — the counsellor's typo stays recoverable", async () => {
    const { token } = mintInvitationToken();
    const { client, rows } = fakeCaseDb(fixture(token));

    await redeem(client, token, { actorEmail: "typo@example.test" });

    expect(rows.invitations![0]!.accepted_at).toBeNull();
    expect(rows.invitations![0]!.revoked_at).toBeNull();
  });
});

// =======================================================================================
// Decision C — the same student's second click
// =======================================================================================
describe("MV-194 decision C — a second click by the SAME student lands in the case", () => {
  test("reports `already-yours` rather than an error", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(
      fixture(token, { accepted_at: "2026-08-20T09:00:00.000Z" }, [
        { id: CASE_A, organization_id: ORG_A, student_user_id: STUDENT },
      ]),
    );

    const result = await redeem(client, token);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("already-yours");
    expect(result.caseId).toBe(CASE_A);
  });

  test("does NOT re-stamp accepted_at — the replay predicate is what stops it", async () => {
    // THE TEST THE `accepted_at is null` MUTANT KILLS. Drop that predicate and this second
    // click wins the swap outright, moving the timestamp and writing a second acceptance
    // over the first. Every other assertion in this file stays green.
    const { token } = mintInvitationToken();
    const stamped = "2026-08-20T09:00:00.000Z";
    const { client, rows } = fakeCaseDb(
      fixture(token, { accepted_at: stamped }, [
        { id: CASE_A, organization_id: ORG_A, student_user_id: STUDENT },
      ]),
    );

    await redeem(client, token);

    expect(rows.invitations![0]!.accepted_at).toBe(stamped);
  });

  test("the short-circuit is DOWNSTREAM of the swap, so it weakens nothing for anyone else", async () => {
    const { token } = mintInvitationToken();
    const { client, queries } = fakeCaseDb(
      fixture(token, { accepted_at: "2026-08-20T09:00:00.000Z" }, [
        { id: CASE_A, organization_id: ORG_A, student_user_id: STUDENT },
      ]),
    );

    await redeem(client, token);

    // If "is this already yours?" were asked FIRST, the swap would never run in the
    // already-accepted state and the replay predicate would be untestable from outside.
    expect(hasSwapFilters(queries[0]!)).toBe(true);
  });
});

// =======================================================================================
// Failures that are failures, not silent successes
// =======================================================================================
describe("MV-194 — a swap that could not complete is never reported as a refusal", () => {
  test("a PostgREST error on the swap is `redeem-failed`, not `invalid-token`", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(fixture(token), {
      updateError: { invitations: { message: "connection reset" } },
    });

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // "Your link is invalid" for a database outage sends the student to their counsellor
    // for a new link that will fail exactly the same way.
    expect(result.reason).toBe("redeem-failed");
  });

  test("a diagnosis read that fails is `redeem-failed`", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(fixture(token, { expires_at: PAST }), {
      errorOn: { invitations: { message: "connection reset" } },
    });

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("redeem-failed");
  });

  test("a client that throws outright is `redeem-failed`", async () => {
    const { token } = mintInvitationToken();
    const { client } = fakeCaseDb(fixture(token), { throwOn: ["invitations"] });

    const result = await redeem(client, token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("redeem-failed");
  });

  test.each([
    ["a blank token", { token: "   " }],
    ["a blank actor", { actorUserId: "" }],
    ["a blank address", { actorEmail: "  " }],
  ])("%s never reaches the database", async (_label, overrides) => {
    const { token } = mintInvitationToken();
    const { client, queries } = fakeCaseDb(fixture(token));

    const result = await redeemInvitationToken(client, {
      token,
      actorUserId: STUDENT,
      actorEmail: EMAIL,
      now: NOW,
      ...overrides,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid-input");
    expect(queries).toEqual([]);
  });
});

// =======================================================================================
// The link — the second write, and decision D
// =======================================================================================
describe("MV-194 — linking the case to the student", () => {
  test("writes student_user_id and nothing else", async () => {
    const { client, updates, rows } = fakeCaseDb({
      cases: [{ id: CASE_A, organization_id: ORG_A, student_user_id: null }],
    });

    const result = await linkCaseToStudent(client, CASE_A, STUDENT);

    expect(result.ok).toBe(true);
    const patch = updates.find((u) => u.table === "cases");
    expect(Object.keys(patch!.patch)).toEqual(["student_user_id"]);
    expect(rows.cases![0]!.student_user_id).toBe(STUDENT);
  });

  test("carries `student_user_id is null` — decision D is enforced by the PREDICATE, not by a check", async () => {
    const { client, queries } = fakeCaseDb({
      cases: [{ id: CASE_A, organization_id: ORG_A, student_user_id: null }],
    });

    await linkCaseToStudent(client, CASE_A, STUDENT);

    const write = queries.find((q) => q.table === "cases");
    expect(write!.filters).toContainEqual(["id", CASE_A]);
    // Without this, a stale token evicts a linked student and no re-read can undo it.
    expect(write!.filters).toContainEqual(["student_user_id", null]);
  });

  test("decision D — a case already held by ANOTHER student is refused, never overwritten", async () => {
    const { client, rows } = fakeCaseDb({
      cases: [{ id: CASE_A, organization_id: ORG_A, student_user_id: OTHER_STUDENT }],
    });

    const result = await linkCaseToStudent(client, CASE_A, STUDENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("case-already-linked");
    expect(rows.cases![0]!.student_user_id).toBe(OTHER_STUDENT);
  });

  test("a case already held by THIS student is a success — the outcome is already theirs", async () => {
    const { client } = fakeCaseDb({
      cases: [{ id: CASE_A, organization_id: ORG_A, student_user_id: STUDENT }],
    });

    const result = await linkCaseToStudent(client, CASE_A, STUDENT);

    expect(result.ok).toBe(true);
  });

  test("a case that vanished is `link-failed`, not `case-already-linked`", async () => {
    const { client } = fakeCaseDb({ cases: [] });

    const result = await linkCaseToStudent(client, CASE_A, STUDENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The two answer differently: one says "somebody else has this case", the other says
    // "we could not tell". Reporting the second as the first is a claim that is simply false.
    expect(result.reason).toBe("link-failed");
  });

  test("a write error is `link-failed`", async () => {
    const { client } = fakeCaseDb(
      { cases: [{ id: CASE_A, organization_id: ORG_A, student_user_id: null }] },
      { updateError: { cases: { message: "connection reset" } } },
    );

    const result = await linkCaseToStudent(client, CASE_A, STUDENT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("link-failed");
  });

  test("it touches ONE case — the invitation's, never a second one", async () => {
    const { client, rows } = fakeCaseDb({
      cases: [
        { id: CASE_A, organization_id: ORG_A, student_user_id: null },
        { id: CASE_B, organization_id: ORG_A, student_user_id: null },
      ],
    });

    await linkCaseToStudent(client, CASE_A, STUDENT);

    expect(rows.cases![1]!.student_user_id, "a second case was linked").toBeNull();
  });
});
