import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CaseScopeProvider } from "@/components/cases/case-scope";
import { ShortlistButton } from "@/components/matches/shortlist-button";
import { DocumentStatusToggle } from "@/components/documents/document-status-toggle";
import { PlanItemCard } from "@/components/plan/plan-item-card";
import { OutcomeSelfReport } from "@/components/outcomes/outcome-self-report";
import { useSectionSave } from "@/components/profile/editors/section-save";
import type { PlanItemRow } from "@/lib/plan/types";

/**
 * MV-172 — the browser half of spec F-8, and the half a route test cannot reach.
 *
 * The seven routes now accept an explicit case id and authorize it. That closes
 * the server side. It does **not** close the defect: a control that never names
 * the case it is rendered in sends no `caseId`, the route falls back to the
 * actor's own personal case exactly as before, and the counsellor's shortlist,
 * checklist, plan and profile absorb the student's edits. Every route test still
 * passes, because the route did what it was asked.
 *
 * So each of the five write controls is rendered TWICE — inside a case scope and
 * outside one — and the request body is read both times:
 *
 * - **inside** a `CaseScopeProvider`, the body names that case;
 * - **outside** one, the body names no case at all, so `/matches`, `/plan`,
 *   `/checklist` and `/profile` keep resolving the signed-in student's own case
 *   and nothing about the personal surfaces changes.
 *
 * The second half is not ceremony. A control that hard-coded a case id, or that
 * sent `caseId: null`, would pass the first assertion and break every student.
 */

const CASE = "aaaaaaaa-0000-4000-8000-000000000001";

const PLAN_ITEM: PlanItemRow = {
  id: 4,
  owner: null,
  kind: "k",
  impact: "high",
  title: "Upload IELTS",
  body: "Body",
  liftEstimate: "Unlocks 3 matches",
  timeEstimate: "2 minutes",
  status: "todo",
  createdAt: "2026-08-11",
  completedAt: null,
  startedAt: null,
};

/** The profile editors all save through this hook — it is the single choke point. */
function ProfileSaveHarness() {
  const { save } = useSectionSave("personal");
  return (
    <button type="button" onClick={() => void save({ name: "Asha" })}>
      Save profile
    </button>
  );
}

/**
 * Each control, the interaction that makes it write, and the endpoint it owes.
 * A control added to the case route without a row here is not covered — which is
 * why the sweep below derives the endpoint list from the routes themselves.
 */
const CONTROLS: ReadonlyArray<{
  name: string;
  endpoint: string;
  element: React.ReactElement;
  act: () => Promise<void>;
}> = [
  {
    name: "ShortlistButton (cell 21 — user_program_state)",
    endpoint: "/api/shortlist",
    element: <ShortlistButton programId="p1" initialStatus={null} />,
    act: () => userEvent.click(screen.getByRole("button", { name: "Shortlisted" })),
  },
  {
    name: "DocumentStatusToggle (cell 22 — document_status)",
    endpoint: "/api/documents/status",
    element: <DocumentStatusToggle kind="passport" label="Passport" initialObtained={false} />,
    act: () => userEvent.click(screen.getByRole("checkbox")),
  },
  {
    name: "PlanItemCard (plan_items — §6.2 entry 8)",
    endpoint: "/api/plan/action",
    element: <PlanItemCard item={PLAN_ITEM} />,
    act: () => userEvent.click(screen.getByRole("button", { name: /^Done$/i })),
  },
  {
    name: "OutcomeSelfReport (cell 23 — outcome_events)",
    endpoint: "/api/outcomes/event",
    element: <OutcomeSelfReport attemptId="att-7" nextEvents={["offer_received"]} />,
    act: () => userEvent.click(screen.getByRole("button", { name: "I got an offer" })),
  },
  {
    name: "useSectionSave (profiles — §6.2 entry 9)",
    endpoint: "/api/profile/section",
    element: <ProfileSaveHarness />,
    act: () => userEvent.click(screen.getByRole("button", { name: "Save profile" })),
  },
];

function okFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
}

/** The first request body this control sent, parsed. */
function firstBody(spy: ReturnType<typeof okFetch>): Record<string, unknown> {
  expect(spy, "the control issued no request at all").toHaveBeenCalled();
  const [, init] = spy.mock.calls[0]!;
  return JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe.each(CONTROLS)("$name", ({ endpoint, element, act }) => {
  it(`names the case it is rendered in when POSTing to ${endpoint}`, async () => {
    const spy = okFetch();
    render(<CaseScopeProvider caseId={CASE}>{element}</CaseScopeProvider>);

    await act();

    expect(spy.mock.calls[0]![0]).toBe(endpoint);
    expect(
      firstBody(spy).caseId,
      "this control wrote without naming its case — the route will fall back to the ACTOR's own",
    ).toBe(CASE);
  });

  it("names NO case outside a case scope, so the student's own surfaces are unchanged", async () => {
    const spy = okFetch();
    render(element);

    await act();

    // `undefined`, not `null`: `resolveTargetCase` treats a present-but-unusable
    // `caseId` as MALFORMED, so a control that sent null here would 400 every
    // student's save rather than resolving their personal case.
    expect(firstBody(spy)).not.toHaveProperty("caseId");
  });
});
