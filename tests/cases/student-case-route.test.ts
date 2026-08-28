import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ notFound, redirect }));

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { fakeCaseDb, type CaseDbFixture } from "@/tests/helpers/fake-case-db";
import {
  STUDENT_CASE_ROUTE_BASE,
  openStudentCaseRoute,
  studentCaseRoutePath,
} from "@/lib/cases/student-case-route";

/**
 * MV-195 — the gate on the student's door (Stage 5 slice 3).
 *
 * `openCaseRoute` is the consultancy's gate and cannot serve here: every route it
 * guards lives under `/workspace/[organizationId]`, whose layout gates on ACTIVE
 * `organization_memberships` — a set from which `student` is deliberately excluded
 * — so a linked student hits `notFound()` at the LAYOUT, before any page authorizes
 * anything. This is the same shape for the other side of the boundary.
 *
 * The four outcomes these pin are the card's criteria 1, 2 and 3:
 *
 *  - a linked student on a consultancy case is let in, via
 *    `requireCasePermission(actor, caseId, "case.read")` and NOT via membership;
 *  - "not linked", "unknown case" and "revoked" are ONE answer, so the route is not
 *    an enumeration oracle;
 *  - a LOOKUP FAILURE is an outage and never a permission denial (MV-133);
 *  - the personal case is not reachable under this URL, which is the founder
 *    decision expressed as routing rather than as copy.
 */

const ACTOR = "11111111-1111-4000-8000-111111111111";
const OTHER = "22222222-2222-4000-8000-222222222222";
const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_CASE = "bbbbbbbb-0000-4000-8000-00000000000b";
const PERSONAL_CASE = "cccccccc-0000-4000-8000-00000000000c";

type Options = Parameters<typeof fakeCaseDb>[1];

function stack(fixture: CaseDbFixture, options: Options = {}, user: string | null = ACTOR) {
  const db = fakeCaseDb(fixture, options);
  const supabase = Object.assign(db.client, {
    auth: { getUser: vi.fn(async () => ({ data: { user: user === null ? null : { id: user } } })) },
  });
  createSupabaseServerClient.mockResolvedValue(supabase);
  return { ...db, supabase };
}

/** A consultancy case whose linked student is ACTOR. */
const LINKED: CaseDbFixture = {
  cases: [{ id: ORG_CASE, organization_id: ORG, student_user_id: ACTOR }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("studentCaseRoutePath", () => {
  it("is the one spelling of the student's case URL", () => {
    expect(STUDENT_CASE_ROUTE_BASE).toBe("/consultancy");
    expect(studentCaseRoutePath(ORG_CASE)).toBe(`/consultancy/${ORG_CASE}`);
  });

  it("names no organization — the URL must not put the student inside the workspace", () => {
    // Decision A. The consultancy's own naming is not the student's to carry, and
    // `organizations_select_member` would not let them read it anyway.
    expect(studentCaseRoutePath(ORG_CASE)).not.toContain(ORG);
    expect(studentCaseRoutePath(ORG_CASE)).not.toContain("workspace");
  });
});

describe("who is let in", () => {
  it("admits the LINKED student and returns the authenticated client", async () => {
    const { supabase } = stack(LINKED);

    const gate = await openStudentCaseRoute(ORG_CASE);

    expect(gate).toMatchObject({ ok: true, userId: ACTOR, caseId: ORG_CASE, organizationId: ORG });
    // The AUTHENTICATED client, published so the panels provably read as the
    // signed-in user. A service-role read would render identical markup with the
    // tenant boundary switched off.
    expect(gate.ok && gate.supabase).toBe(supabase);
  });

  it("refuses a student who is not linked to this case", async () => {
    stack({ cases: [{ id: ORG_CASE, organization_id: ORG, student_user_id: OTHER }] });

    await expect(openStudentCaseRoute(ORG_CASE)).rejects.toThrow("NOT_FOUND");
  });

  it("refuses an unknown case with the SAME answer", async () => {
    // Criterion 2: one refusal, so the route cannot be used to discover which case
    // ids exist. `getCaseContext` already declines to distinguish these; a route
    // must not undo it.
    stack({ cases: [] });

    await expect(openStudentCaseRoute(ORG_CASE)).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("refuses a REVOKED link with the same answer — the case is simply no longer theirs", async () => {
    // Revocation on this axis is `cases.student_user_id` ceasing to be the actor.
    stack({ cases: [{ id: ORG_CASE, organization_id: ORG, student_user_id: null }] });

    await expect(openStudentCaseRoute(ORG_CASE)).rejects.toThrow("NOT_FOUND");
  });

  it("refuses STAFF — this door is the student's, and theirs is /workspace", async () => {
    // A counsellor reaching a student's case through the student surface would be
    // reading a page built to show only what its subject may see. Not a leak, but
    // the wrong door, and `case.read` alone cannot tell the two apart: the gate asks
    // for the STUDENT grant specifically.
    stack({
      cases: [{ id: ORG_CASE, organization_id: ORG, student_user_id: OTHER }],
      organization_memberships: [
        { organization_id: ORG, user_id: ACTOR, role: "admin", status: "active" },
      ],
    });

    await expect(openStudentCaseRoute(ORG_CASE)).rejects.toThrow("NOT_FOUND");
  });

  it("admits a DUAL-ROLE actor who is staff AND this case's student", async () => {
    // The dual-role rule: the two grants are additive and neither vetoes the other.
    // Somebody who works at a consultancy and is also a student of one of its cases
    // holds their own case as a data subject, not as staff.
    stack({
      cases: [{ id: ORG_CASE, organization_id: ORG, student_user_id: ACTOR }],
      organization_memberships: [
        { organization_id: ORG, user_id: ACTOR, role: "admin", status: "active" },
      ],
    });

    await expect(openStudentCaseRoute(ORG_CASE)).resolves.toMatchObject({ ok: true });
  });
});

describe("the personal case is not reachable here", () => {
  it("refuses the actor's OWN personal case under the consultancy URL", async () => {
    // The founder decision as routing. A student passes `case.read` at `linked` on
    // their personal case, so permission alone would let it render under a heading
    // that says a consultancy holds it — which is a lie about whose workspace is on
    // screen, and the same reasoning `openCaseRoute` gives for refusing a case from
    // another organization.
    stack({ cases: [{ id: PERSONAL_CASE, organization_id: null, student_user_id: ACTOR }] });

    await expect(openStudentCaseRoute(PERSONAL_CASE)).rejects.toThrow("NOT_FOUND");
  });
});

describe("the failures stay apart", () => {
  it("a LOOKUP FAILURE is an outage, never a permission denial", async () => {
    // MISTAKES.md, MV-133: `lookup-failed` is always an outage. Rendering `notFound()`
    // here would tell a student the case they signed up for does not exist because
    // Supabase blipped — and a 404 has nothing to retry.
    stack({}, { errorOn: { cases: { message: "boom" } } });

    await expect(openStudentCaseRoute(ORG_CASE)).resolves.toEqual({ ok: false, outage: "access" });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("a malformed id is refused BEFORE any query — it is not an outage", async () => {
    // `cases.id` is a uuid, so a malformed segment raises `22P02` inside the
    // permission lookup and would be reported as `lookup-failed` — blaming the
    // server for a request that was never a candidate.
    const { queries } = stack(LINKED);

    await expect(openStudentCaseRoute("not-a-uuid")).rejects.toThrow("NOT_FOUND");
    expect(queries).toHaveLength(0);
  });

  it("sends an unauthenticated visitor to sign in, and back to THIS case", async () => {
    stack(LINKED, {}, null);

    await expect(openStudentCaseRoute(ORG_CASE)).rejects.toThrow(/REDIRECT:/);
    expect(redirect).toHaveBeenCalledWith(
      `/auth?next=${encodeURIComponent(`/consultancy/${ORG_CASE}`)}`,
    );
  });
});
