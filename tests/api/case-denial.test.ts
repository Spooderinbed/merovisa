import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

/**
 * MV-157 §C's OWN TEST-PLAN LINE, shipped — the denial half of every migrated
 * route.
 *
 * The card asked for it verbatim: "an **unauthorized** path where
 * `requireCasePermission` denies and the route 403s **before any query is
 * issued** (assert the db mock recorded zero calls) — 'authorized after reading'
 * is the defect this catches." It did not ship. `git grep 'allowed: false' --
 * tests` returned nothing across all 26 touched suites: every one of them mocks
 * `checkCasePermission` to `{allowed:true}` in a shared `beforeEach` and never
 * varies it, and `resolvePersonalCaseId` was never mocked to null either. So the
 * 403 branch in 15 routes and every `caseId === null` branch had no coverage at
 * all, and deleting either branch would have kept CI green.
 *
 * ## Why one suite rather than a case added to each of the 26
 *
 * Three of these paths have no suite of their own at all
 * (`/api/documents/[id]/view`, and the checklist/documents pages in the sibling
 * file), so a per-suite edit would have covered 12 of 15 routes and called it
 * done. More importantly the assertion is the SAME assertion 15 times — it is a
 * matrix, and a matrix belongs in one file where a missing row is visible. The
 * per-route suites keep owning the authorized behaviour.
 *
 * ## What "zero db calls" means here, exactly
 *
 * The repositories are NOT mocked. Both Supabase clients are, and their `from`
 * and `storage` members are spies, so a query issued by any real repository this
 * route calls lands on a spy. `expect(from).not.toHaveBeenCalled()` is therefore
 * a claim about the route's ORDERING — authorize, then read — rather than about
 * which functions it happened to call. That is the property the card names, and
 * it is the one a "check the permission after loading the row" refactor breaks.
 */

const { getUser, from, storage, adminFrom, adminStorage } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  storage: { from: vi.fn() },
  adminFrom: vi.fn(),
  adminStorage: { from: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from, storage }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: adminFrom, storage: adminStorage }),
}));

const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission, checkOrgPermission } =
  vi.hoisted(() => ({
    resolvePersonalCaseId: vi.fn(),
    ensurePersonalCase: vi.fn(),
    checkCasePermission: vi.fn(),
    checkOrgPermission: vi.fn(),
  }));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));
// MV-171's creation route gates on the ORG entry point, because creation is the one
// verb that precedes the row it acts on. Its denial owes the same "zero queries"
// property, so it is denied here alongside the case-scoped ones.
vi.mock("@/lib/cases/require-org-permission", () => ({ checkOrgPermission }));

// Rate limiting and the LLM provider are the only two module-level dependencies
// that would reach the network. Neither is on the authorization path.
vi.mock("@/lib/rate-limit/upstash", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  ipFromRequest: () => "127.0.0.1",
}));
vi.mock("@/lib/guide/deepseek", () => ({ deepseekChat: vi.fn().mockResolvedValue("hello") }));
// `/api/assess` reads the catalogue BEFORE it resolves the case (a failed
// catalogue read must 503 rather than score against []), so the catalogue is
// served from fixtures — otherwise its own reads would show up as "db calls" and
// the assertion below would be measuring the wrong thing.
vi.mock("@/lib/programs/repo", async () => {
  const { TEST_PROGRAMS, TEST_UNIVERSITIES } = await import("../fixtures/catalog");
  return {
    listAllPrograms: vi.fn().mockResolvedValue(TEST_PROGRAMS),
    listAllUniversities: vi.fn().mockResolvedValue(TEST_UNIVERSITIES),
    getProgram: vi.fn().mockResolvedValue(null),
    listProgramsForField: vi.fn().mockResolvedValue([]),
  };
});

import { POST as assessPost } from "@/app/api/assess/route";
import { POST as refreshPost } from "@/app/api/assess/refresh/route";
import { DELETE as documentDelete } from "@/app/api/documents/[id]/route";
import { GET as documentView } from "@/app/api/documents/[id]/view/route";
import { POST as documentStatusPost } from "@/app/api/documents/status/route";
import { POST as uploadPost } from "@/app/api/documents/upload/route";
import { POST as guideChatPost } from "@/app/api/guide/chat/route";
import { POST as attemptPost } from "@/app/api/outcomes/attempt/route";
import { POST as eventPost } from "@/app/api/outcomes/event/route";
import { POST as predictionPost } from "@/app/api/outcomes/prediction/route";
import { GET as outcomesGet } from "@/app/api/outcomes/route";
import { POST as planActionPost } from "@/app/api/plan/action/route";
import { PATCH as profileSectionPatch } from "@/app/api/profile/section/route";
import { POST as shortlistPost } from "@/app/api/shortlist/route";
// MV-171's four write surfaces — cells 8, 9, 10 and the case-scoped scoring route.
import { POST as orgCasesPost } from "@/app/api/org/[organizationId]/cases/route";
import { PATCH as casePatch } from "@/app/api/cases/[caseId]/route";
import { PUT as caseAssignmentPut } from "@/app/api/cases/[caseId]/assignment/route";
import { POST as caseAssessPost } from "@/app/api/cases/[caseId]/assess/route";

const ACTOR = "11111111-1111-1111-1111-111111111111";
/** A real v4 UUID — `z.uuid()` checks the version nibble, so `2222…` 422s. */
const UUID = "22222222-2222-4222-a222-222222222222";

const json = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_PROFILE = {
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

/**
 * jsdom/undici cannot round-trip a multipart Request body, so `formData()` is
 * stubbed — the same workaround `tests/api/documents/upload.test.ts` uses.
 */
const uploadRequest = (): Request => {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "p.png", { type: "image/png" }));
  form.append("kind", "passport");
  return {
    method: "POST",
    url: "http://localhost/api/documents/upload",
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
};

/**
 * Every migrated route with an authorization gate, the status it owes on a
 * DENIAL, and the status it owes when the actor has no personal case.
 *
 * `noCaseStatus` is deliberately not uniform: three routes treat "no personal
 * case" as the empty state a brand-new account is in (200), and the rest treat
 * it as a failure to give the student a workspace. Writing them down is the
 * point — an undocumented mix is how one of them silently becomes the wrong one.
 */
const ROUTES: ReadonlyArray<{
  name: string;
  /**
   * Repo-relative path, forward slashes. This is what makes the completeness check
   * below derivable: the filesystem is swept for gated routes and every one of them
   * has to appear here, so a route added without a row fails the suite instead of
   * being counted by a constant somebody hand-edited.
   */
  file: string;
  call: () => Promise<Response>;
  denyStatus: number;
  /**
   * The status owed when the actor has NO personal case — or `null` for a route
   * whose case comes from its own path segment, where the question does not arise.
   * `null` is not an opt-out: those rows are asserted to never call either personal-
   * case resolver, which is the property that makes "the case came from the path"
   * true rather than assumed.
   */
  noCaseStatus: number | null;
  /** `/api/assess` uses the create-or-resolve helper, not the read-only one. */
  resolver?: "ensure";
}> = [
  {
    name: "POST /api/assess (signed-in insert branch)",
    file: "app/api/assess/route.ts",
    call: () => assessPost(json("http://localhost/api/assess", "POST", VALID_PROFILE)),
    // No literal 403: the route folds a denial into its persist-failure leg so a
    // signed-in student is never told "saved" when nothing was saved.
    denyStatus: 500,
    noCaseStatus: 500,
    resolver: "ensure",
  },
  {
    name: "POST /api/assess/refresh",
    file: "app/api/assess/refresh/route.ts",
    call: () => refreshPost(),
    denyStatus: 403,
    // 409 + a redirect to the wizard: with no case there is nothing to re-score.
    noCaseStatus: 409,
  },
  {
    name: "DELETE /api/documents/[id]",
    file: "app/api/documents/[id]/route.ts",
    call: () =>
      documentDelete(new Request("http://localhost/api/documents/x", { method: "DELETE" }), {
        params: Promise.resolve({ id: UUID }),
      }),
    denyStatus: 403,
    noCaseStatus: 404,
  },
  {
    name: "GET /api/documents/[id]/view",
    file: "app/api/documents/[id]/view/route.ts",
    call: () =>
      documentView(new Request("http://localhost/api/documents/x/view"), {
        params: Promise.resolve({ id: UUID }),
      }),
    denyStatus: 403,
    noCaseStatus: 404,
  },
  {
    name: "POST /api/documents/status",
    file: "app/api/documents/status/route.ts",
    call: () =>
      documentStatusPost(
        json("http://localhost/api/documents/status", "POST", { kind: "passport", obtained: true }),
      ),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/documents/upload",
    file: "app/api/documents/upload/route.ts",
    call: () => uploadPost(uploadRequest()),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/guide/chat",
    file: "app/api/guide/chat/route.ts",
    call: () => guideChatPost(json("http://localhost/api/guide/chat", "POST", { message: "hi" })),
    denyStatus: 403,
    // The guide answers on an EMPTY context for a case-less account, exactly as
    // it does for a signed-in user who has not assessed.
    noCaseStatus: 200,
  },
  {
    name: "POST /api/outcomes/attempt",
    file: "app/api/outcomes/attempt/route.ts",
    call: () =>
      attemptPost(json("http://localhost/api/outcomes/attempt", "POST", { predictionId: UUID })),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/outcomes/event",
    file: "app/api/outcomes/event/route.ts",
    call: () =>
      eventPost(
        json("http://localhost/api/outcomes/event", "POST", {
          attemptId: UUID,
          eventType: "applied",
          occurredAt: "2026-08-01T00:00:00.000Z",
        }),
      ),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/outcomes/prediction",
    file: "app/api/outcomes/prediction/route.ts",
    call: () =>
      predictionPost(json("http://localhost/api/outcomes/prediction", "POST", { programId: "p1" })),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "GET /api/outcomes",
    file: "app/api/outcomes/route.ts",
    call: () => outcomesGet(),
    denyStatus: 403,
    // An empty history is the honest answer for an account with no case.
    noCaseStatus: 200,
  },
  {
    name: "POST /api/plan/action",
    file: "app/api/plan/action/route.ts",
    call: () => planActionPost(json("http://localhost/api/plan/action", "POST", { id: 1, status: "done" })),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "PATCH /api/profile/section",
    file: "app/api/profile/section/route.ts",
    call: () =>
      profileSectionPatch(
        json("http://localhost/api/profile/section", "PATCH", {
          section: "personal",
          patch: { name: "Asha" },
        }),
      ),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/shortlist",
    file: "app/api/shortlist/route.ts",
    call: () =>
      shortlistPost(
        json("http://localhost/api/shortlist", "POST", { programId: "p1", status: "shortlisted" }),
      ),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  /**
   * MV-171's four write surfaces. Every one of them was absent from this array —
   * which is exactly the gap the completeness check below now closes, because the
   * old one asserted that an array of fourteen hand-written names contained fourteen
   * distinct hand-written names.
   *
   * All four take their identifier from a PATH SEGMENT rather than from the actor's
   * personal case, so `noCaseStatus` is `null`: "the actor has no personal case" is
   * not a question these routes can be asked. What replaces that test is the
   * assertion that they never call either personal-case resolver — see below.
   */
  {
    name: "POST /api/org/[organizationId]/cases (cell 8)",
    file: "app/api/org/[organizationId]/cases/route.ts",
    call: () =>
      orgCasesPost(json(`http://localhost/api/org/${UUID}/cases`, "POST", { displayName: "A" }), {
        params: Promise.resolve({ organizationId: UUID }),
      }),
    denyStatus: 403,
    noCaseStatus: null,
  },
  {
    name: "PATCH /api/cases/[caseId] (cell 10)",
    file: "app/api/cases/[caseId]/route.ts",
    call: () =>
      casePatch(
        json(`http://localhost/api/cases/${UUID}`, "PATCH", { operationalStatus: "closed" }),
        { params: Promise.resolve({ caseId: UUID }) },
      ),
    denyStatus: 403,
    noCaseStatus: null,
  },
  {
    name: "PUT /api/cases/[caseId]/assignment (cell 9)",
    file: "app/api/cases/[caseId]/assignment/route.ts",
    call: () =>
      caseAssignmentPut(
        json(`http://localhost/api/cases/${UUID}/assignment`, "PUT", { membershipId: UUID }),
        { params: Promise.resolve({ caseId: UUID }) },
      ),
    denyStatus: 403,
    noCaseStatus: null,
  },
  {
    name: "POST /api/cases/[caseId]/assess (the case-scoped scoring route)",
    file: "app/api/cases/[caseId]/assess/route.ts",

    call: () =>
      caseAssessPost(json(`http://localhost/api/cases/${UUID}/assess`, "POST", VALID_PROFILE), {
        params: Promise.resolve({ caseId: UUID }),
      }),
    denyStatus: 403,
    noCaseStatus: null,
  },
];

/** Every `app/api/**\/route.ts`, as repo-relative forward-slash paths. */
function apiRouteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      apiRouteFiles(absolute, found);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      found.push(path.relative(process.cwd(), absolute).split(path.sep).join("/"));
    }
  }
  return found;
}

/**
 * Comments out, so a doc comment merely NAMING the permission layer is not read as a
 * gate. Split on /\r?\n/ — a CRLF checkout otherwise makes the line filter match
 * nothing and every detection below would silently return false.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

/**
 * Does this route gate on the CASE permission layer? Two detectors, unioned, so the
 * sweep fails closed: the import specifier (which cannot hide in a comment, and is
 * present whichever of the two functions the route uses) and the call shape.
 */
function isCaseGated(absolutePath: string): boolean {
  const code = stripComments(readFileSync(absolutePath, "utf8"));
  return (
    code.includes("@/lib/cases/require-permission") ||
    /\b(?:check|require)CasePermission\s*\(/.test(code)
  );
}

describe("MV-157 §C — every migrated route DENIES before it reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: "a@example.test" } } });
    resolvePersonalCaseId.mockResolvedValue("case-1");
    ensurePersonalCase.mockResolvedValue("case-1");
  });

  /**
   * DERIVED FROM THE FILESYSTEM, because the check it replaces could not fail.
   *
   * It read `expect(new Set(ROUTES.map((r) => r.name)).size).toBe(14)` next to
   * `expect(ROUTES).toHaveLength(14)` — which asserts that an array of fourteen
   * hand-written names contains fourteen distinct hand-written names. True by
   * construction, and therefore blind to the one thing a completeness check exists
   * for: MV-171 added four authorization-gated routes and not one of them appeared
   * here, so their 403 branches shipped with no denial coverage at all and the
   * "covers all 14 gated routes" test stayed green throughout.
   *
   * The expected set now comes from the working tree: sweep `app/api` for routes that
   * gate on the case-permission layer, and require each to hold a row. A route added
   * without one fails here rather than being counted by a constant somebody edited in
   * the same commit.
   */
  it("covers every case-gated route in app/api — derived from the tree, not from this array", () => {
    const gated = apiRouteFiles(path.join(process.cwd(), "app", "api")).filter((file) =>
      isCaseGated(path.join(process.cwd(), file)),
    );

    // A silent zero — a bad glob, a renamed directory — would make the subset check
    // below pass vacuously, which is the failure mode this whole test replaces.
    expect(gated.length).toBeGreaterThan(10);

    const registered = new Set(ROUTES.map((route) => route.file));
    expect(
      gated.filter((file) => !registered.has(file)),
      "these routes gate on checkCasePermission/requireCasePermission but have no row in ROUTES",
    ).toEqual([]);
  });

  it("registers no row for a file that does not exist, and none twice", () => {
    // The other direction: a stale row would keep the subset check above green while
    // asserting nothing about anything.
    for (const route of ROUTES) {
      expect(existsSync(path.join(process.cwd(), route.file)), route.file).toBe(true);
    }
    expect(new Set(ROUTES.map((route) => route.file)).size).toBe(ROUTES.length);
    expect(new Set(ROUTES.map((route) => route.name)).size).toBe(ROUTES.length);
  });

  it("does not register /api/account/delete, which has no case gate to deny", () => {
    // Deliberately absent, and now that absence is DERIVED too rather than asserted
    // in a comment: it is Auth-account teardown scoped to the departing AUTH USER, so
    // the sweep must genuinely not find a case gate in it. If one is ever added, the
    // completeness check above starts demanding a row.
    const file = "app/api/account/delete/route.ts";
    expect(existsSync(path.join(process.cwd(), file))).toBe(true);
    expect(isCaseGated(path.join(process.cwd(), file))).toBe(false);
    expect(ROUTES.some((route) => route.file === file)).toBe(false);
  });

  describe.each(ROUTES)("$name", ({ call, denyStatus, noCaseStatus, resolver }) => {
    it(`answers ${denyStatus} on a denial and issues ZERO queries`, async () => {
      // BOTH entry points deny. Most of these routes ask the case-scoped one, and
      // MV-171's creation route asks the org-scoped one because creation precedes the
      // row it acts on; denying both means the row does not have to declare which,
      // and the assertion stays about ORDERING rather than about plumbing.
      checkCasePermission.mockResolvedValue({
        decision: { allowed: false, reason: "not-a-member" },
        context: {},
      });
      checkOrgPermission.mockResolvedValue({
        decision: { allowed: false, requiredScope: null, reason: "not-a-member" },
        context: {},
      });

      const res = await call();

      expect(res.status).toBe(denyStatus);
      // THE assertion the card named. A route that loads the row and then checks
      // the permission still returns the right status — and fails right here.
      expect(from).not.toHaveBeenCalled();
      expect(adminFrom).not.toHaveBeenCalled();
      expect(storage.from).not.toHaveBeenCalled();
      expect(adminStorage.from).not.toHaveBeenCalled();
    });

    const noCaseTitle =
      noCaseStatus === null
        ? "takes its case from the path, so it never resolves a personal case"
        : `answers ${noCaseStatus} when the actor has no personal case, and issues ZERO queries`;

    it(noCaseTitle, async () => {
      // The other uncovered branch. It is reachable in production today: an
      // account created before MV-155's backfill, or one whose personal-case
      // insert lost a race and returned null.
      checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
      checkOrgPermission.mockResolvedValue({
        decision: { allowed: true, requiredScope: "all-org", reason: null },
        context: {},
      });
      resolvePersonalCaseId.mockResolvedValue(null);
      ensurePersonalCase.mockResolvedValue(null);

      if (noCaseStatus === null) {
        // `null` is NOT an opt-out from the matrix. A path-scoped route must be
        // proven path-scoped: if it ever started resolving the actor's personal case
        // it would be answering a different question from the one its URL asks, and
        // it would owe the row above a status. The permission check still has to
        // receive a real case id, asserted below with everyone else.
        await call();
        expect(resolvePersonalCaseId).not.toHaveBeenCalled();
        expect(ensurePersonalCase).not.toHaveBeenCalled();
      } else {
        const res = await call();

        expect(res.status).toBe(noCaseStatus);
        expect(from).not.toHaveBeenCalled();
        expect(adminFrom).not.toHaveBeenCalled();
        if (resolver === "ensure") {
          expect(ensurePersonalCase).toHaveBeenCalled();
        } else {
          expect(resolvePersonalCaseId).toHaveBeenCalled();
        }
      }

      // A route must never fall through to the permission check with a null case:
      // `checkCasePermission(actor, null, …)` is the shape that turns "no case"
      // into an authorization question about a case that does not exist.
      for (const args of checkCasePermission.mock.calls) {
        expect(args[1]).not.toBeNull();
      }
    });
  });

  it("a denial never reaches the permission check with a case the CLIENT supplied", async () => {
    // MV-157 §A's other half, asserted once rather than per route: the case id
    // handed to `checkCasePermission` is always the one the resolver returned for
    // the SESSION actor, never a value that came off the request.
    checkCasePermission.mockResolvedValue({ decision: { allowed: false }, context: {} });
    resolvePersonalCaseId.mockResolvedValue("case-from-session");

    await shortlistPost(
      json("http://localhost/api/shortlist", "POST", {
        programId: "p1",
        status: "shortlisted",
        caseId: "case-the-client-asked-for",
      }),
    );

    expect(checkCasePermission).toHaveBeenCalledWith(
      ACTOR,
      "case-from-session",
      "case.update",
      expect.anything(),
    );
  });
});
