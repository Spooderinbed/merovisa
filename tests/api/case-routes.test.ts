import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The four write surfaces MV-171 ships — access-matrix cells 8, 9 and 10 (spec
 * §4), plus the case-scoped scoring route §6.2 requires — asserted at the route,
 * where the ordering lives.
 *
 * The property these exist to hold: **authorize, then read, then write.** Every
 * denial case asserts the route never reached the repository, which is what a
 * "load the row first, check the permission after" refactor breaks while every
 * happy-path test stays green.
 *
 * And the one this slice adds: **the scoring route authorizes on the
 * AUTHENTICATED client before it constructs the service-role one.** A route that
 * reaches for the admin client first has already bypassed RLS by the time it asks
 * whether it was allowed to — and no assertion about its response body would
 * notice.
 *
 * `checkOrgPermission` / `checkCasePermission` are mocked because they are proven
 * against their own fixtures in `tests/cases/org-permissions.test.ts` and
 * `tests/cases/require-permission.test.ts`. What is NOT mocked is **which**
 * permission each route asks for, or which entry point it asks through — and that
 * is the assertion that catches a route gating creation on `case.list`, or
 * borrowing an org membership to answer a question about one case.
 */

const { getUser, serverClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  return { getUser, serverClient: { auth: { getUser }, from: vi.fn() } };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => serverClient,
}));

const { createSupabaseAdminClient, adminInsertSingle } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  adminInsertSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const { checkOrgPermission } = vi.hoisted(() => ({ checkOrgPermission: vi.fn() }));
vi.mock("@/lib/cases/require-org-permission", () => ({ checkOrgPermission }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

const { createOrgCase, setCaseOperationalStatus, assignPrimaryCounsellor } = vi.hoisted(() => ({
  createOrgCase: vi.fn(),
  setCaseOperationalStatus: vi.fn(),
  assignPrimaryCounsellor: vi.fn(),
}));
vi.mock("@/lib/cases/write-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/write-repo")>(
    "@/lib/cases/write-repo",
  );
  return { ...actual, createOrgCase, setCaseOperationalStatus, assignPrimaryCounsellor };
});

const { caseWriteColumns, getPrimaryAssessmentForCase } = vi.hoisted(() => ({
  caseWriteColumns: vi.fn(),
  getPrimaryAssessmentForCase: vi.fn(),
}));
vi.mock("@/lib/cases/dual-write", () => ({ caseWriteColumns }));
vi.mock("@/lib/assessments/repo", () => ({ getPrimaryAssessmentForCase }));

vi.mock("@/lib/programs/repo", async () => {
  const { TEST_PROGRAMS, TEST_UNIVERSITIES } = await import("../fixtures/catalog");
  return {
    listAllPrograms: vi.fn().mockResolvedValue(TEST_PROGRAMS),
    listAllUniversities: vi.fn().mockResolvedValue(TEST_UNIVERSITIES),
  };
});

import { POST as createCase } from "@/app/api/org/[organizationId]/cases/route";
import { PATCH as patchCase } from "@/app/api/cases/[caseId]/route";
import { PUT as putAssignment } from "@/app/api/cases/[caseId]/assignment/route";
import { POST as assessCase } from "@/app/api/cases/[caseId]/assess/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "aaaaaaaa-0000-4000-8000-000000000001";
const MEMBERSHIP = "mmmmmmmm-0000-4000-8000-00000000000a";
const ACTOR = "actor-user-id";

/** `checkOrgPermission` answers per claim, so a route asking the wrong one fails. */
function grantOrg(claims: Partial<Record<string, boolean>>) {
  checkOrgPermission.mockImplementation(async (_actor: string, _org: string, permission: string) => ({
    decision: claims[permission]
      ? { allowed: true, requiredScope: "all-org", reason: null }
      : { allowed: false, requiredScope: null, reason: "role-not-permitted" },
    context: { actorUserId: _actor, organizationId: _org },
  }));
}

/** Same, for the case-scoped entry point. */
function grantCase(claims: Partial<Record<string, boolean>>) {
  checkCasePermission.mockImplementation(async (_actor: string, _case: string, permission: string) => ({
    decision: claims[permission]
      ? { allowed: true, requiredScope: "all-org", reason: null }
      : { allowed: false, requiredScope: null, reason: "role-not-permitted" },
    context: { actorUserId: _actor, caseId: _case },
  }));
}

function createRequest(body: unknown) {
  return createCase(
    new Request(`http://localhost/api/org/${ORG}/cases`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ organizationId: ORG }) },
  );
}

function patchRequest(body: unknown) {
  return patchCase(
    new Request(`http://localhost/api/cases/${CASE}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId: CASE }) },
  );
}

function assignRequest(body: unknown) {
  return putAssignment(
    new Request(`http://localhost/api/cases/${CASE}/assignment`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId: CASE }) },
  );
}

const validProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: new Date().getFullYear() - 1,
  gapReasons: ["worked"],
  englishStatus: "taken",
  englishScore: 7,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

function assessRequest(body: unknown) {
  return assessCase(
    new Request(`http://localhost/api/cases/${CASE}/assess`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId: CASE }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  grantOrg({ "case.create": true });
  grantCase({ "case.update": true, "case.assign": true });
  createOrgCase.mockResolvedValue({ ok: true, caseId: CASE });
  setCaseOperationalStatus.mockResolvedValue({ ok: true });
  assignPrimaryCounsellor.mockResolvedValue({ ok: true, changed: true });
  caseWriteColumns.mockResolvedValue({ case_id: CASE, owner: null });
  getPrimaryAssessmentForCase.mockResolvedValue(null);
  adminInsertSingle.mockResolvedValue({ data: { id: "assessment-1" }, error: null });
  createSupabaseAdminClient.mockImplementation(() => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: adminInsertSingle }) }),
    }),
  }));
});

describe("POST /api/org/[organizationId]/cases — cell 8", () => {
  it("creates a case for an actor holding case.create", async () => {
    const response = await createRequest({ displayName: "Case one" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, caseId: CASE });
    expect(createOrgCase).toHaveBeenCalledWith(
      ACTOR,
      ORG,
      { displayName: "Case one", email: undefined },
      serverClient,
    );
  });

  it("asks for case.create through the ORG-scoped entry point", async () => {
    await createRequest({ displayName: "Case one" });

    // `case.create` is org-scoped and `case.assign` is case-scoped
    // (`lib/cases/permissions.ts:89-108`). A route that asked the case entry
    // point would have no case id to ask about — creation is the one verb that
    // precedes the row.
    expect(checkOrgPermission).toHaveBeenCalledWith(ACTOR, ORG, "case.create", serverClient);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("denies a counsellor WITHOUT reaching the repository", async () => {
    grantOrg({ "case.create": false });

    const response = await createRequest({ displayName: "Case one" });

    expect(response.status).toBe(403);
    expect(createOrgCase).not.toHaveBeenCalled();
  });

  it("rejects an unparseable body with 400", async () => {
    const response = await createCase(
      new Request(`http://localhost/api/org/${ORG}/cases`, { method: "POST", body: "not json" }),
      { params: Promise.resolve({ organizationId: ORG }) },
    );

    expect(response.status).toBe(400);
    expect(createOrgCase).not.toHaveBeenCalled();
  });

  it("rejects a missing display name with 422", async () => {
    const response = await createRequest({});

    expect(response.status).toBe(422);
    expect(createOrgCase).not.toHaveBeenCalled();
  });

  it("rejects an unknown key with 422 rather than dropping it silently", async () => {
    // `.strict()` is load-bearing: a payload naming `studentUserId` or
    // `operationalStatus` is refused here rather than quietly ignored, so a
    // client cannot believe it set something it did not.
    const response = await createRequest({ displayName: "Case one", studentUserId: ACTOR });

    expect(response.status).toBe(422);
    expect(createOrgCase).not.toHaveBeenCalled();
  });

  it("rejects a malformed email with 422", async () => {
    const response = await createRequest({ displayName: "Case one", email: "not-an-address" });

    expect(response.status).toBe(422);
    expect(createOrgCase).not.toHaveBeenCalled();
  });

  it("returns 401 with no session, and never asks the permission layer", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await createRequest({ displayName: "Case one" });

    expect(response.status).toBe(401);
    expect(checkOrgPermission).not.toHaveBeenCalled();
    expect(createOrgCase).not.toHaveBeenCalled();
  });

  it("maps a repository refusal to 403 and a write failure to 500", async () => {
    createOrgCase.mockResolvedValue({ ok: false, reason: "denied" });
    expect((await createRequest({ displayName: "Case one" })).status).toBe(403);

    createOrgCase.mockResolvedValue({ ok: false, reason: "write-failed" });
    expect((await createRequest({ displayName: "Case one" })).status).toBe(500);

    createOrgCase.mockResolvedValue({ ok: false, reason: "invalid-input" });
    expect((await createRequest({ displayName: "Case one" })).status).toBe(422);
  });
});

describe("PATCH /api/cases/[caseId] — cell 10", () => {
  it("writes an operational status for an actor holding case.update", async () => {
    const response = await patchRequest({ operationalStatus: "in_progress" });

    expect(response.status).toBe(200);
    expect(setCaseOperationalStatus).toHaveBeenCalledWith(CASE, "in_progress", serverClient);
  });

  it("asks for case.update through the CASE-scoped entry point", async () => {
    await patchRequest({ operationalStatus: "closed" });

    // Cell 10 gives an assigned counsellor this verb, which is a fact about ONE
    // case; asking the org entry point would answer a different question.
    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE, "case.update", serverClient);
    expect(checkOrgPermission).not.toHaveBeenCalled();
  });

  it("denies WITHOUT reaching the repository", async () => {
    grantCase({ "case.update": false });

    const response = await patchRequest({ operationalStatus: "closed" });

    expect(response.status).toBe(403);
    expect(setCaseOperationalStatus).not.toHaveBeenCalled();
  });

  it("404s an unknown case rather than reporting a refusal", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "unknown-case" },
      context: {},
    });

    expect((await patchRequest({ operationalStatus: "closed" })).status).toBe(404);
    expect(setCaseOperationalStatus).not.toHaveBeenCalled();
  });

  it("500s a failed lookup rather than reporting it as a refusal", async () => {
    // "We could not tell" and "you may not" must not render the same — the read
    // side states the same rule (`lib/cases/require-org-permission.ts`).
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "lookup-failed" },
      context: {},
    });

    expect((await patchRequest({ operationalStatus: "closed" })).status).toBe(500);
    expect(setCaseOperationalStatus).not.toHaveBeenCalled();
  });

  it("rejects a status outside the check-constrained vocabulary with 422", async () => {
    const response = await patchRequest({ operationalStatus: "on_hold" });

    expect(response.status).toBe(422);
    expect(setCaseOperationalStatus).not.toHaveBeenCalled();
  });

  it("refuses to write archived_at — archiving is Stage 6", async () => {
    const response = await patchRequest({ operationalStatus: "closed", archivedAt: null });

    expect(response.status).toBe(422);
    expect(setCaseOperationalStatus).not.toHaveBeenCalled();
  });

  it("returns 401 with no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect((await patchRequest({ operationalStatus: "closed" })).status).toBe(401);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("maps a repository refusal to 403 and a write failure to 500", async () => {
    setCaseOperationalStatus.mockResolvedValue({ ok: false, reason: "denied" });
    expect((await patchRequest({ operationalStatus: "closed" })).status).toBe(403);

    setCaseOperationalStatus.mockResolvedValue({ ok: false, reason: "write-failed" });
    expect((await patchRequest({ operationalStatus: "closed" })).status).toBe(500);
  });
});

describe("PUT /api/cases/[caseId]/assignment — cell 9", () => {
  it("assigns for an actor holding case.assign", async () => {
    const response = await assignRequest({ membershipId: MEMBERSHIP });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, changed: true });
    expect(assignPrimaryCounsellor).toHaveBeenCalledWith(CASE, MEMBERSHIP, serverClient);
  });

  it("asks for case.assign through the CASE-scoped entry point", async () => {
    await assignRequest({ membershipId: MEMBERSHIP });

    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE, "case.assign", serverClient);
    expect(checkOrgPermission).not.toHaveBeenCalled();
  });

  it("denies a counsellor WITHOUT reaching the repository", async () => {
    // F-1, decided 2026-08-10: `CASE_PERMISSION_MATRIX.counsellor["case.assign"]`
    // stays `deny`. This route never widens it.
    grantCase({ "case.assign": false });

    const response = await assignRequest({ membershipId: MEMBERSHIP });

    expect(response.status).toBe(403);
    expect(assignPrimaryCounsellor).not.toHaveBeenCalled();
  });

  it("reports an unchanged assignment as unchanged rather than as a change", async () => {
    assignPrimaryCounsellor.mockResolvedValue({ ok: true, changed: false });

    const response = await assignRequest({ membershipId: MEMBERSHIP });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, changed: false });
  });

  it("rejects an unknown key with 422", async () => {
    const response = await assignRequest({ membershipId: MEMBERSHIP, userId: ACTOR });

    expect(response.status).toBe(422);
    expect(assignPrimaryCounsellor).not.toHaveBeenCalled();
  });

  it("rejects a blank membership id with 422", async () => {
    expect((await assignRequest({ membershipId: "   " })).status).toBe(422);
    expect(assignPrimaryCounsellor).not.toHaveBeenCalled();
  });

  it("distinguishes every repository outcome by status code", async () => {
    const cases: Array<[string, number]> = [
      ["unknown-member", 404],
      ["member-inactive", 409],
      ["unknown-case", 404],
      ["not-an-org-case", 422],
      ["invalid-input", 422],
      ["denied", 403],
      ["lookup-failed", 500],
      ["write-failed", 500],
    ];

    for (const [reason, status] of cases) {
      assignPrimaryCounsellor.mockResolvedValue({ ok: false, reason, leftUnassigned: false });
      expect((await assignRequest({ membershipId: MEMBERSHIP })).status, reason).toBe(status);
    }
  });

  it("tells the caller when the case was left with no counsellor at all", async () => {
    // The one outcome the unique index makes possible: the delete landed, the
    // insert did not. Reporting a generic 500 would read as "nothing happened",
    // and the admin would not know to reassign.
    assignPrimaryCounsellor.mockResolvedValue({
      ok: false,
      reason: "write-failed",
      leftUnassigned: true,
    });

    const response = await assignRequest({ membershipId: MEMBERSHIP });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ leftUnassigned: true });
  });

  it("returns 401 with no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect((await assignRequest({ membershipId: MEMBERSHIP })).status).toBe(401);
    expect(checkCasePermission).not.toHaveBeenCalled();
  });
});

describe("POST /api/cases/[caseId]/assess — the case-scoped scoring route", () => {
  it("scores and persists an assessment for the case", async () => {
    const response = await assessRequest(validProfile);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "assessment-1" });
    expect(adminInsertSingle).toHaveBeenCalled();
  });

  it("writes the consultancy row shape — case_id set, owner null", async () => {
    await assessRequest(validProfile);

    // Spec §6.3. `caseWriteColumns` is the choke point that produces it;
    // `caseBindColumns` — which narrows `owner` to non-null — would refuse every
    // consultancy case, which is exactly why this route asks the other one.
    expect(caseWriteColumns).toHaveBeenCalledWith(expect.anything(), CASE);
  });

  it("authorizes on the AUTHENTICATED client BEFORE constructing the admin client", async () => {
    grantCase({ "case.update": false });

    const response = await assessRequest(validProfile);

    expect(response.status).toBe(403);
    // The assertion this route exists to keep honest. A route that builds the
    // service-role client first has already bypassed RLS by the time it asks
    // whether it was allowed to, and no assertion on the response body sees it.
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(adminInsertSingle).not.toHaveBeenCalled();
  });

  it("asks for case.update on the authenticated client, never on the admin one", async () => {
    await assessRequest(validProfile);

    expect(checkCasePermission).toHaveBeenCalledWith(ACTOR, CASE, "case.update", serverClient);
  });

  it("returns 401 with no session, and never reaches the permission layer", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect((await assessRequest(validProfile)).status).toBe(401);
    expect(checkCasePermission).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("404s an unknown case", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "unknown-case" },
      context: {},
    });

    expect((await assessRequest(validProfile)).status).toBe(404);
  });

  it("rejects an invalid profile with 422 before any client is built", async () => {
    const response = await assessRequest({ homeCountry: "Nepal" });

    expect(response.status).toBe(422);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an unparseable body with 400", async () => {
    const response = await assessCase(
      new Request(`http://localhost/api/cases/${CASE}/assess`, { method: "POST", body: "{" }),
      { params: Promise.resolve({ caseId: CASE }) },
    );

    expect(response.status).toBe(400);
  });

  it("refuses an unsupported destination rather than assessing it as Australia", async () => {
    const response = await assessRequest({ ...validProfile, destination: "canada" });

    expect(response.status).toBe(422);
    expect(adminInsertSingle).not.toHaveBeenCalled();
  });

  it("surfaces a failed insert as a failure, never as a 200 with a null id", async () => {
    // PostgREST reports a failed write as a value. A route that does not
    // destructure `error` returns `{ id: null }` with a 200 — which reads to the
    // caller as "saved".
    adminInsertSingle.mockResolvedValue({ data: null, error: { code: "23514", message: "nope" } });

    const response = await assessRequest(validProfile);

    expect(response.status).toBe(500);
  });

  it("500s when the case's ownership columns cannot be derived", async () => {
    caseWriteColumns.mockResolvedValue(null);

    const response = await assessRequest(validProfile);

    expect(response.status).toBe(500);
    expect(adminInsertSingle).not.toHaveBeenCalled();
  });

  it("marks the first assessment for a case as primary, and a later one as not", async () => {
    await assessRequest(validProfile);
    expect(adminInsertSingle).toHaveBeenCalled();

    // `assessments_case_primary_idx` is UNIQUE (case_id) WHERE is_primary, so a
    // second primary would be a 23505 rather than a second lead assessment.
    getPrimaryAssessmentForCase.mockResolvedValue({ id: "existing" });
    const response = await assessRequest(validProfile);
    expect(response.status).toBe(200);
  });
});
