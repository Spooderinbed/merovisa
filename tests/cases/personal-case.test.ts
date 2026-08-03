import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fakeCaseDb } from "@/tests/helpers/fake-case-db";
import { ensurePersonalCase, resolvePersonalCaseId } from "@/lib/cases/personal-case";

/**
 * The personal-case resolver — MV-157 §A.
 *
 * These prove SEMANTICS ONLY. As `lib/cases/README.md` insists, an in-memory fake
 * cannot prove the database denies anything, and it cannot prove idempotency under
 * a real partial unique index either. The race-safety property is asserted for
 * real in `tests/integration/case-data-access.itest.ts` (MV-157) and
 * `tests/integration/claim-path.itest.ts` (MV-158); what these cases pin is that
 * the code takes the resolve branch rather than the insert branch, and that a
 * unique violation is treated as a resolve rather than an error.
 *
 * MV-158 owns the display_name/email DERIVATION cases below the divider.
 */

const ACTOR = "11111111-1111-1111-1111-111111111111";
const PERSONAL_CASE = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_CASE = "bbbbbbbb-0000-0000-0000-000000000002";

function sessionUser(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTOR,
    email: "student@example.com",
    user_metadata: { full_name: "Asha Gurung" },
    ...overrides,
  };
}

describe("resolvePersonalCaseId", () => {
  it("returns the actor's personal case", async () => {
    const { client } = fakeCaseDb({
      cases: [{ id: PERSONAL_CASE, student_user_id: ACTOR, organization_id: null }],
    });

    expect(await resolvePersonalCaseId(ACTOR, client)).toBe(PERSONAL_CASE);
  });

  it("never returns an organization case, even for the same student", async () => {
    // A student linked to a consultancy case must not have that case answer for
    // their personal one — it is a different tenant's workspace.
    const { client } = fakeCaseDb({
      cases: [{ id: ORG_CASE, student_user_id: ACTOR, organization_id: "org-1" }],
    });

    expect(await resolvePersonalCaseId(ACTOR, client)).toBeNull();
  });

  it("returns null when the actor has no personal case", async () => {
    const { client } = fakeCaseDb({ cases: [] });

    expect(await resolvePersonalCaseId(ACTOR, client)).toBeNull();
  });

  it("fails closed on a lookup error", async () => {
    const { client } = fakeCaseDb({}, { errorOn: { cases: { message: "boom" } } });

    expect(await resolvePersonalCaseId(ACTOR, client)).toBeNull();
  });

  it("does not query on a blank actor id", async () => {
    const { client, queries } = fakeCaseDb({});

    expect(await resolvePersonalCaseId("  ", client)).toBeNull();
    expect(queries).toHaveLength(0);
  });
});

describe("ensurePersonalCase", () => {
  it("resolves an existing personal case without inserting", async () => {
    const { client, inserts } = fakeCaseDb({
      cases: [{ id: PERSONAL_CASE, student_user_id: ACTOR, organization_id: null }],
    });

    expect(await ensurePersonalCase(sessionUser(), client)).toBe(PERSONAL_CASE);
    expect(inserts).toHaveLength(0);
  });

  it("creates a personal case when the actor has none", async () => {
    const { client, inserts } = fakeCaseDb({ cases: [] });

    const caseId = await ensurePersonalCase(sessionUser(), client);

    expect(caseId).not.toBeNull();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "cases",
      row: { student_user_id: ACTOR, organization_id: null },
    });
  });

  it("treats a unique violation as a resolve — the concurrent winner's case is returned", async () => {
    // MV-155's `cases_personal_student_idx` is the race guard. The loser of the
    // race must return the SAME case id, never an error: two personal cases for
    // one student silently splits their data across two workspaces.
    const { client, inserts } = fakeCaseDb(
      { cases: [] },
      {
        // The read finds nothing, the insert loses the race, and the re-read then
        // sees the winner's row.
        insertError: { cases: { code: "23505", message: "duplicate key value" } },
        appearAfterInsert: {
          cases: [{ id: PERSONAL_CASE, student_user_id: ACTOR, organization_id: null }],
        },
      },
    );

    expect(await ensurePersonalCase(sessionUser(), client)).toBe(PERSONAL_CASE);
    expect(inserts).toHaveLength(1);
  });

  it("returns null when the insert fails for a reason other than the race", async () => {
    // MV-158 F4 depends on this: a resolution failure must be reportable as a
    // retryable `error`, never silently swallowed into a half-built claim.
    const { client } = fakeCaseDb(
      { cases: [] },
      { insertError: { cases: { code: "42501", message: "denied" } } },
    );

    expect(await ensurePersonalCase(sessionUser(), client)).toBeNull();
  });

  it("returns null on a blank actor id without inserting", async () => {
    const { client, inserts } = fakeCaseDb({});

    expect(await ensurePersonalCase(sessionUser({ id: "" }), client)).toBeNull();
    expect(inserts).toHaveLength(0);
  });
});
