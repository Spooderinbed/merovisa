import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { fakeCaseDb, type CaseDbFixture, type FakeCaseDbOptions } from "../helpers/fake-case-db";

vi.mock("server-only", () => ({}));

/**
 * MV-181 — the persistent case frame (spec §1, "Persistent case context").
 *
 * MV-172 gave every case page its own copy of a heading. This is the delta: ONE
 * `layout.tsx` owns the case's identity, so navigating profile → matches → plan
 * keeps the same header mounted instead of re-rendering seven near-identical
 * ones, and the section nav can mark where you are.
 *
 * ## What this file proves that the page tests cannot
 *
 * The page tests (`case-route-pages.test.tsx`) render pages in isolation — which
 * is exactly right for "does this page re-authorize", and exactly blind to "what
 * does the frame say". The frame is a separate segment with its own gate, so it
 * gets its own file.
 *
 * ## The frame's own honesty rules
 *
 * The header states six facts about a person's case. Every one of them has a
 * failure mode where the honest answer is NOT the obvious one:
 *
 * - Who is assigned, to a viewer who is not staff on the case — withheld, not
 *   "unassigned" (`lib/cases/case-frame.ts` explains why the read is not made).
 * - A failed assignment read — "couldn't check", not "unassigned".
 * - The linkage marker — a word, never a colour alone.
 * - No raw `student_user_id` and no whole Auth user id anywhere in the markup.
 */

const { getUser, redirect, notFound, useSelectedLayoutSegment } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((_target: string) => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useSelectedLayoutSegment: vi.fn(() => null as string | null),
}));

const { supabase } = vi.hoisted(() => ({ supabase: { current: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => supabase.current,
}));
vi.mock("next/navigation", () => ({ redirect, notFound, useSelectedLayoutSegment }));

const { checkCasePermission } = vi.hoisted(() => ({ checkCasePermission: vi.fn() }));
vi.mock("@/lib/cases/require-permission", () => ({ checkCasePermission }));

import CaseFrameLayout from "@/app/(app)/workspace/[organizationId]/students/[caseId]/layout";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const CASE = "22222222-2222-4222-a222-222222222222";
const ACTOR = "actor-user-id";
const COUNSELLOR = "7f3c9a1e-4b2d-4c6e-8a10-000000000001";
const STUDENT_USER = "5d0b41c2-9e77-4a55-b3c1-000000000009";

const BASE = `/workspace/${ORG}/students/${CASE}`;

function fixture(overrides: CaseDbFixture = {}): CaseDbFixture {
  return {
    cases: [
      {
        id: CASE,
        organization_id: ORG,
        display_name: "Asha Gurung",
        email: "asha@example.test",
        operational_status: "ready_for_review",
        student_user_id: null,
        archived_at: null,
      },
    ],
    case_assignments: [
      {
        id: "assignment-1",
        case_id: CASE,
        user_id: COUNSELLOR,
        assignment_role: "primary_counsellor",
      },
    ],
    organization_memberships: [
      {
        id: "membership-1",
        organization_id: ORG,
        user_id: COUNSELLOR,
        role: "counsellor",
        status: "active",
      },
    ],
    ...overrides,
  };
}

function seed(overrides: CaseDbFixture = {}, options: FakeCaseDbOptions = {}) {
  const fake = fakeCaseDb(fixture(overrides), options);
  supabase.current = { auth: { getUser }, from: fake.from, tag: "authenticated" };
  return fake;
}

function grant(grantedRoles: string[] = ["counsellor"]) {
  checkCasePermission.mockResolvedValue({
    decision: { allowed: true, requiredScope: "assigned", reason: null },
    context: { grantedRoles },
  });
}

const frame = (
  overrides: Partial<{ organizationId: string; caseId: string }> = {},
  children: React.ReactNode = <p>panel</p>,
) =>
  CaseFrameLayout({
    children,
    params: Promise.resolve({ organizationId: ORG, caseId: CASE, ...overrides }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  useSelectedLayoutSegment.mockReturnValue(null);
  getUser.mockResolvedValue({ data: { user: { id: ACTOR } } });
  grant();
  seed();
});

describe("the persistent case header — spec §1's seven items", () => {
  it("names the student", async () => {
    render(await frame());

    expect(screen.getByRole("heading", { level: 1, name: "Asha Gurung" })).toBeInTheDocument();
  });

  it("returns to the DAY VIEW, not to the case directory", async () => {
    // Spec §1, "Return behavior": the back link always targets
    // `/workspace/[organizationId]`. MV-172's shell pointed at `/students`, which
    // is All cases — a different surface with a different job.
    render(await frame());

    const back = screen.getByRole("link", { name: /day view/i });
    expect(back.getAttribute("href")).toBe(`/workspace/${ORG}`);
  });

  it("shows the email address on file", async () => {
    render(await frame());

    expect(screen.getByText("asha@example.test")).toBeInTheDocument();
  });

  it("says there is no email rather than showing an empty space", async () => {
    seed({
      cases: [
        {
          id: CASE,
          organization_id: ORG,
          display_name: "Asha Gurung",
          email: null,
          operational_status: "new",
          student_user_id: null,
          archived_at: null,
        },
      ],
    });

    render(await frame());

    expect(screen.getByText(/no email address on file/i)).toBeInTheDocument();
  });

  it("marks the linkage state with a word", async () => {
    render(await frame());

    expect(screen.getByText("No student account")).toBeInTheDocument();
  });

  it("says a linked student's name and email are their own words", async () => {
    // Spec §3: "Student linked," followed by "Name and email may be
    // self-reported." The frame is where a counsellor decides how much weight to
    // put on the two identity fields directly above it.
    seed({
      cases: [
        {
          id: CASE,
          organization_id: ORG,
          display_name: "Asha Gurung",
          email: "asha@example.test",
          operational_status: "new",
          student_user_id: STUDENT_USER,
          archived_at: null,
        },
      ],
    });

    render(await frame());

    expect(screen.getByText("Student linked")).toBeInTheDocument();
    expect(screen.getByText(/name and email may be self-reported/i)).toBeInTheDocument();
  });

  it("shows the operational status as a sentence-case word", async () => {
    render(await frame());

    expect(screen.getByText("Ready for review")).toBeInTheDocument();
  });

  it("shows the primary assignee as Role · truncated id", async () => {
    render(await frame());

    const header = screen.getByRole("region", { name: /case context/i });
    expect(within(header).getByText("Counsellor")).toBeInTheDocument();
    expect(within(header).getByText(COUNSELLOR.slice(0, 8))).toBeInTheDocument();
  });

  it("says Unassigned when the slot is empty", async () => {
    seed({ case_assignments: [] });

    render(await frame());

    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("says an assignee whose access was switched off is switched off", async () => {
    seed({
      organization_memberships: [
        {
          id: "membership-1",
          organization_id: ORG,
          user_id: COUNSELLOR,
          role: "counsellor",
          status: "inactive",
        },
      ],
    });

    render(await frame());

    expect(screen.getByText(/access switched off/i)).toBeInTheDocument();
  });

  it("does NOT claim the case is unassigned when the assignment could not be read", async () => {
    seed({}, { errorOn: { case_assignments: { message: "boom" } } });

    render(await frame());

    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t check who is assigned/i)).toBeInTheDocument();
  });

  it("withholds who staffs the case from a viewer who is not staff on it", async () => {
    // The linked student holds `case.read` (`CASE_PERMISSION_MATRIX.student`), so
    // they pass the frame's gate. Who a consultancy puts on a case is internal to
    // that consultancy, and an RLS refusal here is indistinguishable from an empty
    // slot — so the read is not made.
    grant(["student"]);

    render(await frame());

    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.queryByText(COUNSELLOR.slice(0, 8))).not.toBeInTheDocument();
  });

  it("marks an archived case as archived", async () => {
    seed({
      cases: [
        {
          id: CASE,
          organization_id: ORG,
          display_name: "Asha Gurung",
          email: null,
          operational_status: "in_progress",
          student_user_id: null,
          archived_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    });

    render(await frame());

    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("puts no raw student or staff user id in the markup", async () => {
    seed({
      cases: [
        {
          id: CASE,
          organization_id: ORG,
          display_name: "Asha Gurung",
          email: "asha@example.test",
          operational_status: "new",
          student_user_id: STUDENT_USER,
          archived_at: null,
        },
      ],
    });

    const { container } = render(await frame());

    expect(container.innerHTML).not.toContain(STUDENT_USER);
    expect(container.innerHTML).not.toContain(COUNSELLOR);
    // The positive half, so "no id" cannot pass against a frame that renders no
    // reference at all.
    expect(container.innerHTML).toContain(COUNSELLOR.slice(0, 8));
  });
});

describe("the case section navigation", () => {
  it("links every shipped case surface, scoped to THIS case", async () => {
    render(await frame());

    const nav = screen.getByRole("navigation", { name: /case/i });
    const expected: Array<[string, string]> = [
      ["Overview", BASE],
      ["Profile", `${BASE}/profile`],
      ["Matches", `${BASE}/matches`],
      ["Plan", `${BASE}/plan`],
      ["Checklist", `${BASE}/checklist`],
      ["Case details", `${BASE}/manage`],
    ];
    for (const [label, href] of expected) {
      expect(within(nav).getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
  });

  it("publishes no link to a route that has not shipped", async () => {
    // Spec §1: "Render Documents, Visa read, and Activity navigation only when
    // their routes ship; never publish dead 'Coming soon' links."
    render(await frame());

    const nav = screen.getByRole("navigation", { name: /case/i });
    for (const absent of ["Documents", "Visa read", "Activity", "Assessment"]) {
      expect(within(nav).queryByRole("link", { name: absent })).not.toBeInTheDocument();
    }
  });

  it("marks the section the reader is in", async () => {
    useSelectedLayoutSegment.mockReturnValue("plan");

    render(await frame());

    const nav = screen.getByRole("navigation", { name: /case/i });
    expect(within(nav).getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Matches" })).not.toHaveAttribute("aria-current");
  });

  it("marks the overview when no section is selected", async () => {
    useSelectedLayoutSegment.mockReturnValue(null);

    render(await frame());

    const nav = screen.getByRole("navigation", { name: /case/i });
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the checklist marked from inside its nested routes", async () => {
    // `/checklist/all` and `/checklist/[programId]` are the same section.
    useSelectedLayoutSegment.mockReturnValue("checklist");

    render(await frame());

    const nav = screen.getByRole("navigation", { name: /case/i });
    expect(within(nav).getByRole("link", { name: "Checklist" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});

describe("the frame decides access for itself", () => {
  it("renders the section content it was given", async () => {
    render(await frame({}, <p>the section</p>));

    expect(screen.getByText("the section")).toBeInTheDocument();
  });

  it("404s an unassigned counsellor rather than confirming the case exists", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "not-assigned" },
      context: {},
    });

    await expect(frame()).rejects.toThrow("NOT_FOUND");
  });

  it("shows an OUTAGE when the access check could not complete — never a 404", async () => {
    checkCasePermission.mockResolvedValue({
      decision: { allowed: false, requiredScope: null, reason: "lookup-failed" },
      context: {},
    });

    render(await frame());

    expect(screen.getByText(/couldn't check your access/i)).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows an OUTAGE when the case row could not be read", async () => {
    seed({}, { errorOn: { cases: { message: "boom" } } });

    render(await frame());

    expect(screen.getByText(/couldn't load this student/i)).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not render the section content inside a frame that could not be established", async () => {
    // A page's facts are only safe to read next to the case they belong to.
    seed({}, { errorOn: { cases: { message: "boom" } } });

    render(await frame({}, <p>the section</p>));

    expect(screen.queryByText("the section")).not.toBeInTheDocument();
  });

  it("404s a case that belongs to a different organization than the URL claims", async () => {
    seed({
      cases: [
        {
          id: CASE,
          organization_id: OTHER_ORG,
          display_name: "Asha Gurung",
          email: null,
          operational_status: "new",
          student_user_id: null,
          archived_at: null,
        },
      ],
    });

    await expect(frame()).rejects.toThrow("NOT_FOUND");
  });

  it("404s a malformed case id instead of blaming the server", async () => {
    await expect(frame({ caseId: "not-a-uuid" })).rejects.toThrow("NOT_FOUND");
    expect(checkCasePermission).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in, and back to where they were going", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(frame()).rejects.toThrow("REDIRECT");
    expect(decodeURIComponent(String(redirect.mock.calls[0]![0]))).toContain(BASE);
  });
});
