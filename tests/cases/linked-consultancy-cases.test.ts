import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fakeCaseDb } from "@/tests/helpers/fake-case-db";
import {
  LINKED_CASE_ROW_CEILING,
  listLinkedConsultancyCases,
} from "@/lib/cases/linked-consultancy-cases";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";

/**
 * MV-195 — the CONSULTANCY-case resolver, and the seam this slice adds.
 *
 * `resolvePersonalCaseId` is the only place a personal route turns an actor into a
 * case id, and it carries `organization_id IS NULL` in its predicate on purpose
 * (MV-157 §A). The obvious shortcut for this slice — letting it answer with both
 * cases — would silently point the whole `(student)` route family at a consultancy
 * case, so the seam is a SECOND function with the mirror-image predicate rather than
 * a widened first one. The last describe block below pins that the first function
 * did not move.
 *
 * Semantics only: an in-memory fake cannot prove the database denies anything
 * (`lib/cases/README.md`). `tests/integration/stage5-student-case.itest.ts` proves
 * the RLS half.
 */

const ACTOR = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const PERSONAL_CASE = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_CASE = "bbbbbbbb-0000-0000-0000-000000000002";
const OTHER_ORG_CASE = "cccccccc-0000-0000-0000-000000000003";

describe("listLinkedConsultancyCases", () => {
  it("returns the consultancy case a student is linked to", async () => {
    const { client } = fakeCaseDb({
      cases: [
        {
          id: ORG_CASE,
          student_user_id: ACTOR,
          organization_id: "org-1",
          created_at: "2026-08-20T09:00:00.000Z",
        },
      ],
    });

    const result = await listLinkedConsultancyCases(ACTOR, client);

    expect(result).toEqual({
      ok: true,
      data: [{ id: ORG_CASE, organizationId: "org-1", openedAt: "2026-08-20T09:00:00.000Z" }],
    });
  });

  it("NEVER returns the personal case — the mirror image of resolvePersonalCaseId", async () => {
    // The founder decision of 2026-08-24 in one assertion: the two cases stay
    // separate, and neither resolver may answer for the other's half. A personal
    // case surfacing here would put `/consultancy` in front of the student's own
    // work under a heading that says a consultancy holds it.
    const { client } = fakeCaseDb({
      cases: [{ id: PERSONAL_CASE, student_user_id: ACTOR, organization_id: null }],
    });

    expect(await listLinkedConsultancyCases(ACTOR, client)).toEqual({ ok: true, data: [] });
  });

  it("asks the DATABASE for `organization_id is not null` rather than filtering after", async () => {
    // A post-filter is a different program: it reads the personal case over the
    // wire and then declines to show it. The predicate is what keeps the row out
    // of the answer at all, and it is the property `resolvePersonalCaseId`'s own
    // comment insists on for the other direction.
    const { client, queries } = fakeCaseDb({ cases: [] });

    await listLinkedConsultancyCases(ACTOR, client);

    const query = queries.find((q) => q.table === "cases");
    expect(query?.filters).toContainEqual(["student_user_id", ACTOR]);
    expect(query?.negations).toContainEqual(["organization_id", "is", null]);
  });

  it("returns only the actor's own cases", async () => {
    const { client } = fakeCaseDb({
      cases: [
        { id: ORG_CASE, student_user_id: ACTOR, organization_id: "org-1", created_at: "2026-08-20T09:00:00.000Z" },
        { id: OTHER_ORG_CASE, student_user_id: OTHER, organization_id: "org-2", created_at: "2026-08-21T09:00:00.000Z" },
      ],
    });

    const result = await listLinkedConsultancyCases(ACTOR, client);

    expect(result.ok && result.data.map((c) => c.id)).toEqual([ORG_CASE]);
  });

  it("orders oldest first, so the case a student has held longest leads", async () => {
    const { client, queries } = fakeCaseDb({
      cases: [
        { id: ORG_CASE, student_user_id: ACTOR, organization_id: "org-1", created_at: "2026-08-20T09:00:00.000Z" },
        { id: OTHER_ORG_CASE, student_user_id: ACTOR, organization_id: "org-2", created_at: "2026-08-25T09:00:00.000Z" },
      ],
    });

    const result = await listLinkedConsultancyCases(ACTOR, client);

    expect(result.ok && result.data.map((c) => c.id)).toEqual([ORG_CASE, OTHER_ORG_CASE]);
    // Ordered at the database, not in JavaScript: the read is bounded by a limit
    // below, so an order applied after truncation would keep a different set.
    expect(queries.find((q) => q.table === "cases")?.order).toContainEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("reports a FAILED lookup as an outage, never as an empty list", async () => {
    // MV-133, on the surface where it costs most: "you have no consultancy case"
    // is a claim, and making it because a query errored tells a student the case
    // they signed up for does not exist.
    const { client } = fakeCaseDb({}, { errorOn: { cases: { message: "boom" } } });

    expect(await listLinkedConsultancyCases(ACTOR, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  it("reports a THROWN query as an outage too", async () => {
    const { client } = fakeCaseDb({}, { throwOn: ["cases"] });

    expect(await listLinkedConsultancyCases(ACTOR, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });

  it("does not query on a blank actor id", async () => {
    const { client, queries } = fakeCaseDb({});

    expect(await listLinkedConsultancyCases("  ", client)).toEqual({ ok: true, data: [] });
    expect(queries).toHaveLength(0);
  });

  it("treats a read at the row ceiling as an outage rather than a silent prefix", async () => {
    // The same rule `listCaseDocumentRequests` applies: PostgREST truncates at
    // `max_rows` without saying so, and a truncated list of a student's own cases
    // would hide one of them behind a page that claims to show them all.
    const { client } = fakeCaseDb({
      cases: Array.from({ length: LINKED_CASE_ROW_CEILING }, (_, i) => ({
        id: `dddddddd-0000-0000-0000-${String(i).padStart(12, "0")}`,
        student_user_id: ACTOR,
        organization_id: "org-1",
        created_at: "2026-08-20T09:00:00.000Z",
      })),
    });

    expect(await listLinkedConsultancyCases(ACTOR, client)).toEqual({
      ok: false,
      reason: "lookup-failed",
    });
  });
});

describe("the personal resolver did not move (MV-195 criterion 4)", () => {
  it("resolvePersonalCaseId answers with the PERSONAL case when the student holds both", async () => {
    // The regression this slice is most able to cause. `resolvePersonalCaseId` is
    // the only place a `(student)` route turns an actor into a case id, so if it
    // ever answered with the consultancy case, `/dashboard`, `/profile`,
    // `/matches`, `/plan`, `/documents` and `/checklist` would all silently
    // re-point at a workspace the consultancy owns.
    const { client } = fakeCaseDb({
      cases: [
        { id: ORG_CASE, student_user_id: ACTOR, organization_id: "org-1" },
        { id: PERSONAL_CASE, student_user_id: ACTOR, organization_id: null },
      ],
    });

    expect(await resolvePersonalCaseId(ACTOR, client)).toBe(PERSONAL_CASE);
  });

  it("keeps `organization_id is null` IN the predicate", async () => {
    const { client, queries } = fakeCaseDb({ cases: [] });

    await resolvePersonalCaseId(ACTOR, client);

    expect(queries.find((q) => q.table === "cases")?.filters).toContainEqual([
      "organization_id",
      null,
    ]);
  });
});
