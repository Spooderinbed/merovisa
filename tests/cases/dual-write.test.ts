import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fakeCaseDb } from "@/tests/helpers/fake-case-db";
import { caseWriteColumns } from "@/lib/cases/dual-write";

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

/**
 * MV-168 RETIRED `caseUpsertColumns`. Its whole reason for existing was that the two UPSERT-seam
 * tables could not be given a `case_id` by the client — an `.upsert()` puts the conflict target in
 * the `ON CONFLICT DO UPDATE SET` list, and `UPDATE (case_id)` is forbidden by design — so it
 * returned `owner` alone and let MV-155 §H's definer trigger derive the rest. The cost was that it
 * refused every case with no `student_user_id`, which is every consultancy case.
 *
 * Stage 3 converted both call sites to read-then-insert. A plain INSERT is privilege-checked
 * against the INSERT grant, which DOES carry `case_id` on both tables, so the seam disappears and
 * `caseWriteColumns` — tested above, and the one helper that legitimately returns `owner: null` —
 * serves them. Its tests are gone with it rather than left asserting a helper nobody calls.
 */
