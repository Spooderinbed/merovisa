import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

/**
 * MV-182 — the documents section of the case route.
 *
 * What these prove: who is let in, what the failure outcomes render as, and — the
 * load-bearing pair — that the chase list is read for **the case in the URL** on the
 * **authenticated** client, and that the write controls appear only for a viewer who
 * is STAFF on the case.
 *
 * They cannot prove Postgres agrees; that is
 * `tests/integration/stage4-document-requests.itest.ts`, which reads the written rows
 * back under a real `authenticated` JWT.
 */

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  notFound,
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { openCaseRoute } = vi.hoisted(() => ({ openCaseRoute: vi.fn() }));
vi.mock("@/lib/cases/case-route", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/case-route")>(
    "@/lib/cases/case-route",
  );
  return { ...actual, openCaseRoute };
});

const { listCaseDocumentRequests } = vi.hoisted(() => ({ listCaseDocumentRequests: vi.fn() }));
vi.mock("@/lib/cases/document-requests-repo", () => ({ listCaseDocumentRequests }));

import CaseDocumentsPage from "@/app/(app)/workspace/[organizationId]/students/[caseId]/documents/page";

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const CASE = "bbbbbbbb-0000-4000-8000-00000000000b";

const authenticated = { tag: "authenticated" };

function gate(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    supabase: authenticated,
    caseRow: { id: CASE, organizationId: ORG, displayName: "Aarav", operationalStatus: "new" },
    grantedRoles: ["counsellor"],
    scope: "assigned",
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    kind: "passport",
    title: "Passport bio page",
    note: null,
    status: "outstanding",
    dueAt: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

async function renderPage() {
  const ui = await CaseDocumentsPage({ params: Promise.resolve({ organizationId: ORG, caseId: CASE }) });
  return render(ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  openCaseRoute.mockResolvedValue(gate());
  listCaseDocumentRequests.mockResolvedValue({ ok: true, data: [row()] });
});

describe("the gate", () => {
  it("passes the organization, the case and its own sub-path to the shared gate", async () => {
    await renderPage();

    // The sub-path travels so an unauthenticated visitor is returned HERE after
    // signing in, rather than to the case overview.
    expect(openCaseRoute).toHaveBeenCalledWith(ORG, CASE, "/documents");
  });

  it("renders the outage when the gate could not answer, never an empty chase list", async () => {
    openCaseRoute.mockResolvedValue({ ok: false, outage: "access" });

    await renderPage();

    expect(screen.getByText(/couldn't check your access/i)).toBeInTheDocument();
    expect(listCaseDocumentRequests).not.toHaveBeenCalled();
  });

  it("re-authorizes for itself rather than trusting the frame", async () => {
    // Next.js does NOT re-render a layout when you navigate between its children, so
    // a counsellor reassigned mid-session keeps the frame mounted. The page's own
    // gate is what bites at the next boundary (spec §5).
    openCaseRoute.mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    await expect(renderPage()).rejects.toThrow("NOT_FOUND");
  });
});

describe("the chase list", () => {
  it("reads THIS case's requests on the AUTHENTICATED client", async () => {
    await renderPage();

    // The case id comes from the URL and the client from the gate. A page that
    // reached for the service-role client would render identical markup with the
    // tenant boundary switched off.
    expect(listCaseDocumentRequests).toHaveBeenCalledWith(CASE, authenticated);
  });

  it("labels each request with the vault's own name for its kind", async () => {
    listCaseDocumentRequests.mockResolvedValue({
      ok: true,
      data: [row({ kind: "bank-statement", title: "Father's statement" })],
    });

    await renderPage();

    // Scoped to the list: the picker below carries every label as an <option>, so an
    // unscoped query would pass on a page that rendered the row with no label at all.
    const outstanding = screen.getByRole("region", { name: /outstanding/i });
    expect(within(outstanding).getByText(/bank statement/i)).toBeInTheDocument();
  });

  it("a kind the vocabulary does not know renders as itself, not as blank", async () => {
    listCaseDocumentRequests.mockResolvedValue({
      ok: true,
      data: [row({ kind: "something-later", title: "A thing" })],
    });

    await renderPage();

    // The check constraint bounds this today, but a widened list would ship rows
    // this build has no label for, and a silently blank line is worse than a raw id.
    const outstanding = screen.getByRole("region", { name: /outstanding/i });
    expect(within(outstanding).getByText(/something-later/)).toBeInTheDocument();
  });

  it("a failed read is an outage, NOT 'nothing outstanding'", async () => {
    listCaseDocumentRequests.mockResolvedValue({ ok: false, reason: "lookup-failed" });

    await renderPage();

    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    // The false sentence this branch exists to prevent: telling a counsellor a case
    // is clear when we could not find out.
    expect(screen.queryByText(/nothing is outstanding/i)).not.toBeInTheDocument();
  });
});

describe("who gets the controls", () => {
  it("staff on the case get the form", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: /ask for this/i })).toBeInTheDocument();
  });

  it("the linked student sees the list and no controls", async () => {
    // `case.read` is `linked` for a student, so they reach this page. Asking is a
    // consultancy act — `can_staff_case` at the database, `deny` in the matrix.
    openCaseRoute.mockResolvedValue(gate({ grantedRoles: ["student"], scope: "linked" }));

    await renderPage();

    expect(screen.getByText("Passport bio page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask for this/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark received/i })).not.toBeInTheDocument();
  });
});
