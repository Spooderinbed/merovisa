import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fakeCaseDb } from "@/tests/helpers/fake-case-db";
import { caseUpsertColumns, caseWriteColumns } from "@/lib/cases/dual-write";

/**
 * The Stage 2 dual-write helper — MV-157 §E.
 *
 * `owner` is DERIVED from `cases.student_user_id`, never passed in. That single
 * property is the only write-time guard the stage has: MV-155's
 * `private.mv155_assert_case_backfill()` is a detector the tests call, not a
 * constraint, so nothing rejects a mismatched write at write time until MV-160
 * makes `case_id` NOT NULL. These cases pin the derivation; the integration suite
 * calls the detector after every mutation.
 */

const PERSONAL_CASE = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_CASE = "bbbbbbbb-0000-0000-0000-000000000002";
const STUDENT = "11111111-1111-1111-1111-111111111111";

describe("caseWriteColumns", () => {
  it("dual-writes case_id and the owner derived from the case", async () => {
    const { client } = fakeCaseDb({
      cases: [{ id: PERSONAL_CASE, student_user_id: STUDENT, organization_id: null }],
    });

    expect(await caseWriteColumns(client, PERSONAL_CASE)).toEqual({
      case_id: PERSONAL_CASE,
      owner: STUDENT,
    });
  });

  it("writes case_id with a NULL owner for a consultancy case", async () => {
    // A consultancy case has no Auth user. The row carries `case_id` only —
    // possible only because MV-156 made `owner` nullable.
    const { client } = fakeCaseDb({
      cases: [{ id: ORG_CASE, student_user_id: null, organization_id: "org-1" }],
    });

    expect(await caseWriteColumns(client, ORG_CASE)).toEqual({
      case_id: ORG_CASE,
      owner: null,
    });
  });

  it("returns null for an unknown case rather than writing an unowned row", async () => {
    const { client } = fakeCaseDb({ cases: [] });

    expect(await caseWriteColumns(client, PERSONAL_CASE)).toBeNull();
  });

  it("fails closed when the case lookup errors", async () => {
    const { client } = fakeCaseDb({}, { errorOn: { cases: { message: "boom" } } });

    expect(await caseWriteColumns(client, PERSONAL_CASE)).toBeNull();
  });
});

describe("caseUpsertColumns", () => {
  it("returns ONLY owner — case_id must stay out of an upsert payload", async () => {
    // MV-155 §H's definer trigger derives `case_id` from `owner` on
    // user_program_state and document_status precisely so the client never names
    // the column: PostgREST compiles an upsert to
    // `INSERT … ON CONFLICT DO UPDATE SET`, putting EVERY payload column in the
    // SET list, and Stage 2 grants no `UPDATE(case_id)` on either table — so a
    // payload carrying it raises 42501 at plan time, on the first call, with no
    // row present. The conflict TARGET may name case_id; the payload may not.
    const { client } = fakeCaseDb({
      cases: [{ id: PERSONAL_CASE, student_user_id: STUDENT, organization_id: null }],
    });

    const columns = await caseUpsertColumns(client, PERSONAL_CASE);

    expect(columns).toEqual({ owner: STUDENT });
    expect(columns).not.toHaveProperty("case_id");
  });

  it("refuses a consultancy case — the upsert seam is not expressible in Stage 2", async () => {
    // With `owner IS NULL` the trigger does not fire, so nothing derives
    // `case_id`, and supplying it would need the `UPDATE(case_id)` grant Stage 2
    // deliberately withholds. Spec §4 rule 2 records this as a Stage 3 residual
    // seam; refusing loudly beats writing a row that trips
    // `_ownership_axis_present` with a 23514 nobody can read.
    const { client } = fakeCaseDb({
      cases: [{ id: ORG_CASE, student_user_id: null, organization_id: "org-1" }],
    });

    expect(await caseUpsertColumns(client, ORG_CASE)).toBeNull();
  });

  it("returns null for an unknown case", async () => {
    const { client } = fakeCaseDb({ cases: [] });

    expect(await caseUpsertColumns(client, PERSONAL_CASE)).toBeNull();
  });
});
