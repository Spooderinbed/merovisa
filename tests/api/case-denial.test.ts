import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { resolvePersonalCaseId, ensurePersonalCase, checkCasePermission } = vi.hoisted(() => ({
  resolvePersonalCaseId: vi.fn(),
  ensurePersonalCase: vi.fn(),
  checkCasePermission: vi.fn(),
}));
vi.mock("@/lib/cases/personal-case", () => ({ resolvePersonalCaseId, ensurePersonalCase }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

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
  call: () => Promise<Response>;
  denyStatus: number;
  noCaseStatus: number;
  /** `/api/assess` uses the create-or-resolve helper, not the read-only one. */
  resolver?: "ensure";
}> = [
  {
    name: "POST /api/assess (signed-in insert branch)",
    call: () => assessPost(json("http://localhost/api/assess", "POST", VALID_PROFILE)),
    // No literal 403: the route folds a denial into its persist-failure leg so a
    // signed-in student is never told "saved" when nothing was saved.
    denyStatus: 500,
    noCaseStatus: 500,
    resolver: "ensure",
  },
  {
    name: "POST /api/assess/refresh",
    call: () => refreshPost(),
    denyStatus: 403,
    // 409 + a redirect to the wizard: with no case there is nothing to re-score.
    noCaseStatus: 409,
  },
  {
    name: "DELETE /api/documents/[id]",
    call: () =>
      documentDelete(new Request("http://localhost/api/documents/x", { method: "DELETE" }), {
        params: Promise.resolve({ id: UUID }),
      }),
    denyStatus: 403,
    noCaseStatus: 404,
  },
  {
    name: "GET /api/documents/[id]/view",
    call: () =>
      documentView(new Request("http://localhost/api/documents/x/view"), {
        params: Promise.resolve({ id: UUID }),
      }),
    denyStatus: 403,
    noCaseStatus: 404,
  },
  {
    name: "POST /api/documents/status",
    call: () =>
      documentStatusPost(
        json("http://localhost/api/documents/status", "POST", { kind: "passport", obtained: true }),
      ),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/documents/upload",
    call: () => uploadPost(uploadRequest()),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/guide/chat",
    call: () => guideChatPost(json("http://localhost/api/guide/chat", "POST", { message: "hi" })),
    denyStatus: 403,
    // The guide answers on an EMPTY context for a case-less account, exactly as
    // it does for a signed-in user who has not assessed.
    noCaseStatus: 200,
  },
  {
    name: "POST /api/outcomes/attempt",
    call: () =>
      attemptPost(json("http://localhost/api/outcomes/attempt", "POST", { predictionId: UUID })),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "POST /api/outcomes/event",
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
    call: () =>
      predictionPost(json("http://localhost/api/outcomes/prediction", "POST", { programId: "p1" })),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "GET /api/outcomes",
    call: () => outcomesGet(),
    denyStatus: 403,
    // An empty history is the honest answer for an account with no case.
    noCaseStatus: 200,
  },
  {
    name: "POST /api/plan/action",
    call: () => planActionPost(json("http://localhost/api/plan/action", "POST", { id: 1, status: "done" })),
    denyStatus: 403,
    noCaseStatus: 500,
  },
  {
    name: "PATCH /api/profile/section",
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
    call: () =>
      shortlistPost(
        json("http://localhost/api/shortlist", "POST", { programId: "p1", status: "shortlisted" }),
      ),
    denyStatus: 403,
    noCaseStatus: 500,
  },
];

describe("MV-157 §C — every migrated route DENIES before it reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: ACTOR, email: "a@example.test" } } });
    resolvePersonalCaseId.mockResolvedValue("case-1");
    ensurePersonalCase.mockResolvedValue("case-1");
  });

  it("covers all 14 gated routes — a route added without a row here is the gap this pins", () => {
    // `/api/account/delete` is the 15th route MV-157 §C moves and is deliberately
    // absent: it is Auth-account teardown scoped to the departing AUTH USER, has
    // no case permission gate to deny, and is covered by its own suite.
    expect(ROUTES).toHaveLength(14);
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(14);
  });

  describe.each(ROUTES)("$name", ({ call, denyStatus, noCaseStatus, resolver }) => {
    it(`answers ${denyStatus} on a denial and issues ZERO queries`, async () => {
      checkCasePermission.mockResolvedValue({
        decision: { allowed: false, reason: "not-a-member" },
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

    it(`answers ${noCaseStatus} when the actor has no personal case, and issues ZERO queries`, async () => {
      // The other uncovered branch. It is reachable in production today: an
      // account created before MV-155's backfill, or one whose personal-case
      // insert lost a race and returned null.
      checkCasePermission.mockResolvedValue({ decision: { allowed: true }, context: {} });
      resolvePersonalCaseId.mockResolvedValue(null);
      ensurePersonalCase.mockResolvedValue(null);

      const res = await call();

      expect(res.status).toBe(noCaseStatus);
      expect(from).not.toHaveBeenCalled();
      expect(adminFrom).not.toHaveBeenCalled();
      if (resolver === "ensure") {
        expect(ensurePersonalCase).toHaveBeenCalled();
      } else {
        expect(resolvePersonalCaseId).toHaveBeenCalled();
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
