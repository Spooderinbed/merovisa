import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * MV-195 — the student's door to their consultancy case (Stage 5 slice 3).
 *
 * Two pages. `/consultancy` resolves which case (or cases) a student is linked to;
 * `/consultancy/<case>` renders one. Between them they close the hole MV-194 left:
 * the case a student accepts an invitation to was unreachable to them.
 *
 * The load-bearing assertions here are criteria 3 and 6:
 *
 *  - a failed read renders an OUTAGE and never an empty state, on BOTH pages — "you
 *    have no consultancy case" is a claim, and making it because a query errored is
 *    the exact lie MV-133 exists to end;
 *  - consultancy-internal material is absent from the RENDERED OUTPUT, not merely
 *    from a component's props. The student is served what has been asked of them and
 *    the judgement on it, and nothing about how the consultancy runs the case.
 *
 * They cannot prove Postgres agrees. `tests/integration/stage5-student-case.itest.ts`
 * reads the same rows back under a real `authenticated` JWT.
 */

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ notFound, redirect }));

const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { listLinkedConsultancyCases } = vi.hoisted(() => ({ listLinkedConsultancyCases: vi.fn() }));
vi.mock("@/lib/cases/linked-consultancy-cases", () => ({ listLinkedConsultancyCases }));

const { openStudentCaseRoute } = vi.hoisted(() => ({ openStudentCaseRoute: vi.fn() }));
vi.mock("@/lib/cases/student-case-route", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/student-case-route")>(
    "@/lib/cases/student-case-route",
  );
  return { ...actual, openStudentCaseRoute };
});

const { listCaseDocumentRequests } = vi.hoisted(() => ({ listCaseDocumentRequests: vi.fn() }));
vi.mock("@/lib/cases/document-requests-repo", () => ({ listCaseDocumentRequests }));

const { listCaseDocumentVersions, listCaseDocumentReviews } = vi.hoisted(() => ({
  listCaseDocumentVersions: vi.fn(),
  listCaseDocumentReviews: vi.fn(),
}));
vi.mock("@/lib/cases/document-collaboration-repo", () => ({
  listCaseDocumentVersions,
  listCaseDocumentReviews,
}));

import ConsultancyIndexPage from "@/app/(app)/(student)/consultancy/page";
import ConsultancyCasePage from "@/app/(app)/(student)/consultancy/[caseId]/page";

const ACTOR = "11111111-1111-4000-8000-111111111111";
const COUNSELLOR = "99999999-9999-4000-8000-999999999999";
const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const CASE = "bbbbbbbb-0000-4000-8000-00000000000b";
const SECOND_CASE = "dddddddd-0000-4000-8000-00000000000d";

const authenticated = { tag: "authenticated" };

function signedIn(user: string | null = ACTOR) {
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: user === null ? null : { id: user } } })) },
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    kind: "passport",
    title: "Passport bio page",
    note: "The page with your photo on it.",
    status: "outstanding",
    dueAt: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

async function renderIndex() {
  return render(await ConsultancyIndexPage());
}

async function renderCase(caseId = CASE) {
  return render(await ConsultancyCasePage({ params: Promise.resolve({ caseId }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
  listLinkedConsultancyCases.mockResolvedValue({
    ok: true,
    data: [{ id: CASE, organizationId: ORG, openedAt: "2026-08-20T00:00:00.000Z" }],
  });
  openStudentCaseRoute.mockResolvedValue({
    ok: true,
    supabase: authenticated,
    userId: ACTOR,
    caseId: CASE,
    organizationId: ORG,
  });
  listCaseDocumentRequests.mockResolvedValue({ ok: true, data: [request()] });
  listCaseDocumentVersions.mockResolvedValue({ ok: true, data: [] });
  listCaseDocumentReviews.mockResolvedValue({ ok: true, data: [] });
});

// ---------------------------------------------------------------------------
// /consultancy — the door
// ---------------------------------------------------------------------------
describe("/consultancy — the door", () => {
  it("sends a student with exactly one consultancy case straight into it", async () => {
    // The same auto-enter `/workspace` makes for a sole-organization actor, and for
    // the same reason: a chooser with one item is a control that does nothing.
    await expect(renderIndex()).rejects.toThrow(`REDIRECT:/consultancy/${CASE}`);
  });

  it("offers a CHOICE when a student is linked to more than one", async () => {
    listLinkedConsultancyCases.mockResolvedValue({
      ok: true,
      data: [
        { id: CASE, organizationId: ORG, openedAt: "2026-08-20T00:00:00.000Z" },
        { id: SECOND_CASE, organizationId: "org-2", openedAt: "2026-08-25T00:00:00.000Z" },
      ],
    });

    await renderIndex();

    expect(screen.getAllByRole("link", { name: /open this case/i })).toHaveLength(2);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("names no consultancy, because a student cannot read one", async () => {
    // `organizations_select_member` admits only actual members, and a student holds
    // no membership row — so there is no organization name to print, and printing
    // an id instead would leak the consultancy's internal naming for nothing
    // (decision A).
    listLinkedConsultancyCases.mockResolvedValue({
      ok: true,
      data: [
        { id: CASE, organizationId: ORG, openedAt: "2026-08-20T00:00:00.000Z" },
        { id: SECOND_CASE, organizationId: "org-2", openedAt: "2026-08-25T00:00:00.000Z" },
      ],
    });

    const { container } = await renderIndex();

    expect(container.textContent).not.toContain(ORG);
    expect(container.textContent).not.toContain("org-2");
  });

  it("tells a student with NO consultancy case the truth, and does not redirect", async () => {
    listLinkedConsultancyCases.mockResolvedValue({ ok: true, data: [] });

    await renderIndex();

    expect(screen.getByText(/no consultancy is working on a case with you/i)).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders an OUTAGE when the lookup failed — never 'you have none'", async () => {
    // The sharpest instance of MV-133 in this slice: the reader is most likely a
    // student who created an account solely to accept an invitation, and telling
    // them no consultancy is working with them would be a specific, confident,
    // wrong sentence.
    listLinkedConsultancyCases.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    await renderIndex();

    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByText(/no consultancy is working on a case with you/i)).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in and back here", async () => {
    signedIn(null);

    await expect(renderIndex()).rejects.toThrow(/REDIRECT:\/auth/);
  });
});

// ---------------------------------------------------------------------------
// /consultancy/[caseId] — the case
// ---------------------------------------------------------------------------
describe("/consultancy/[caseId] — the gate", () => {
  it("authorizes through the student gate, for the case in the URL", async () => {
    await renderCase();

    expect(openStudentCaseRoute).toHaveBeenCalledWith(CASE);
  });

  it("renders an outage when the gate could not answer, and reads nothing", async () => {
    openStudentCaseRoute.mockResolvedValue({ ok: false, outage: "access" });

    await renderCase();

    expect(screen.getByText(/couldn't check your access/i)).toBeInTheDocument();
    expect(listCaseDocumentRequests).not.toHaveBeenCalled();
  });

  it("lets the gate's refusal through rather than catching it", async () => {
    openStudentCaseRoute.mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    await expect(renderCase()).rejects.toThrow("NOT_FOUND");
  });
});

describe("/consultancy/[caseId] — what has been asked", () => {
  it("reads THIS case on the AUTHENTICATED client", async () => {
    await renderCase();

    expect(listCaseDocumentRequests).toHaveBeenCalledWith(CASE, authenticated);
    expect(listCaseDocumentVersions).toHaveBeenCalledWith(CASE, authenticated);
    expect(listCaseDocumentReviews).toHaveBeenCalledWith(CASE, authenticated);
  });

  it("shows each request with the counsellor's own title and instruction", async () => {
    // Stage 4 shipped requests against a case with no way for the invited student to
    // see one (`permissions.ts`: "the student-facing surface that shows it is Stage 5
    // and is not built by MV-182"). This assertion is that sentence being closed.
    await renderCase();

    expect(screen.getByText("Passport bio page")).toBeInTheDocument();
    expect(screen.getByText(/the page with your photo on it/i)).toBeInTheDocument();
  });

  it("adds the vault's word for the kind only when it says something the title does not", async () => {
    // A counsellor usually leaves the title as the kind's own label, and printing
    // both then reads as two requirements rather than one.
    listCaseDocumentRequests.mockResolvedValue({
      ok: true,
      data: [request({ kind: "bank-statement", title: "Father's statement" })],
    });

    await renderCase();

    expect(screen.getByText("Father's statement")).toBeInTheDocument();
    expect(screen.getByText(/bank statement/i)).toBeInTheDocument();
  });

  it("a kind the vocabulary does not know renders as itself, not as blank", async () => {
    listCaseDocumentRequests.mockResolvedValue({
      ok: true,
      data: [request({ kind: "something-later", title: "A thing" })],
    });

    await renderCase();

    expect(screen.getByText(/something-later/)).toBeInTheDocument();
  });

  it("says what has happened to each request, in the actor-neutral words the model already owns", async () => {
    await renderCase();

    expect(screen.getByText(/nothing has arrived against this request yet/i)).toBeInTheDocument();
  });

  it("shows the REJECTION NOTE — the half of the model that is any use to the student", async () => {
    listCaseDocumentVersions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "ver-1",
          requestId: "req-1",
          storagePath: `case/${CASE}/ver-1`,
          fileSize: 100,
          originalName: "passport.pdf",
          contentType: "application/pdf",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    });
    listCaseDocumentReviews.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "rev-1",
          versionId: "ver-1",
          decision: "rejected",
          note: "The photo page is cut off at the bottom.",
          createdAt: "2026-08-22T00:00:00.000Z",
        },
      ],
    });

    await renderCase();

    expect(screen.getByText(/the photo page is cut off at the bottom/i)).toBeInTheDocument();
  });

  it("a failed REQUESTS read is an outage, not 'nothing has been asked of you'", async () => {
    listCaseDocumentRequests.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    await renderCase();

    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByText(/hasn't asked you for anything/i)).not.toBeInTheDocument();
  });

  it("a failed VERSIONS or REVIEWS read is an outage too", async () => {
    // Without this the page would state "nothing has arrived against this request"
    // about every request on the case — confidently, and wrongly.
    listCaseDocumentVersions.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    await renderCase();

    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing has arrived/i)).not.toBeInTheDocument();
  });

  it("an empty chase list says so plainly", async () => {
    listCaseDocumentRequests.mockResolvedValue({ ok: true, data: [] });

    await renderCase();

    expect(screen.getByText(/hasn't asked you for anything yet/i)).toBeInTheDocument();
  });
});

describe("/consultancy/[caseId] — criterion 6: nothing consultancy-internal is served", () => {
  async function renderRich() {
    listCaseDocumentRequests.mockResolvedValue({
      ok: true,
      data: [request({ status: "resolved" })],
    });
    listCaseDocumentVersions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "ver-1",
          requestId: "req-1",
          storagePath: `case/${CASE}/ver-1`,
          fileSize: 100,
          originalName: "passport.pdf",
          contentType: "application/pdf",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    });
    listCaseDocumentReviews.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "rev-1",
          versionId: "ver-1",
          decision: "accepted",
          note: null,
          createdAt: "2026-08-22T00:00:00.000Z",
        },
      ],
    });
    return renderCase();
  }

  it("carries no operational status — that vocabulary is how the consultancy runs the case", async () => {
    // `waiting_on_student` / `ready_for_review` are staff judgements ABOUT the case,
    // not facts for its subject, and `case.notes.internal: "deny"` is the rule they
    // fall under. The page never reads the case row at all, which is why it cannot
    // leak one.
    const { container } = await renderRich();

    for (const word of ["Ready for review", "Waiting on student", "ready_for_review", "waiting_on_student"]) {
      expect(container.textContent, word).not.toContain(word);
    }
  });

  it("carries no identifiers — not the organization, not the actor, not a storage key", async () => {
    const { container } = await renderRich();
    const html = container.innerHTML;

    // The organization id would leak the consultancy's internal naming (decision A).
    expect(html).not.toContain(ORG);
    // A raw Auth user id is no use to a student and does not belong in markup
    // (MV-170's rule, applied to the other reader).
    expect(html).not.toContain(COUNSELLOR);
    expect(html).not.toContain(ACTOR);
    // A Storage key is a path into a bucket holding live student PII.
    expect(html).not.toContain("case/");
  });

  it("offers no consultancy verb — no asking, no marking received, no judging", async () => {
    // `case.documents.request: "deny"` is the WRITE half, and every INSERT policy on
    // the three collaboration tables rides `private.can_staff_case`, which is
    // `can_access_case` MINUS the student disjunct. A control that appeared and then
    // failed would be worse than an absent one: it would tell them they were allowed.
    await renderRich();

    expect(screen.queryByRole("button", { name: /ask for this/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark received/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|reject/i })).not.toBeInTheDocument();
  });
});

describe("/consultancy/[caseId] — the two cases stay separate", () => {
  it("says so, and points back to the student's own work", async () => {
    // The founder decision of 2026-08-24, said on the surface where a student would
    // otherwise wonder where their profile went. It must imply neither transfer nor
    // loss — the same obligation `tests/invitations/accept-copy.test.ts` polices on
    // the accept panel.
    const { container } = await renderCase();

    expect(screen.getByRole("link", { name: /your own MeroVisa work/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    for (const claim of [/brought (over|across)/i, /transferr?ed/i, /\bimported\b/i, /\bsynced\b/i, /\bmerged\b/i]) {
      expect(container.textContent, `claims ${claim}`).not.toMatch(claim);
    }
    for (const loss of [/\blost\b/i, /\bdeleted\b/i, /start(ing)? (again|from scratch)/i]) {
      expect(container.textContent, `implies ${loss}`).not.toMatch(loss);
    }
  });
});
