import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  CaseDocumentRequests,
  type DocumentRequestView,
  type DocumentKindOption,
} from "@/components/workspace/case-document-requests";

/**
 * MV-182 — the chase list from the BROWSER's side.
 *
 * What it exists to hold: the two request bodies these controls send, the split
 * between outstanding and resolved, and what each failure tells the person. A route
 * test proves the route; it does not prove this form ever calls it correctly, and a
 * recovery message reachable through no test is a sentence nobody has read.
 */

const CASE = "aaaaaaaa-0000-4000-8000-000000000001";

const KINDS: DocumentKindOption[] = [
  { kind: "passport", label: "Passport bio page", group: "Identity" },
  { kind: "bank-statement", label: "Bank Statement", group: "Financial" },
];

const OUTSTANDING: DocumentRequestView = {
  id: "req-out",
  kind: "passport",
  kindLabel: "Passport bio page",
  title: "Passport bio page",
  note: "Colour scan, all four corners visible.",
  status: "outstanding",
  dueAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-08-18T00:00:00.000Z",
  resolvedAt: null,
};

const RESOLVED: DocumentRequestView = {
  id: "req-done",
  kind: "bank-statement",
  kindLabel: "Bank Statement",
  title: "Father's bank statement",
  note: null,
  status: "resolved",
  dueAt: null,
  createdAt: "2026-08-10T00:00:00.000Z",
  resolvedAt: "2026-08-15T00:00:00.000Z",
};

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderList(props: Partial<React.ComponentProps<typeof CaseDocumentRequests>> = {}) {
  return render(
    <CaseDocumentRequests
      caseId={CASE}
      requests={[OUTSTANDING, RESOLVED]}
      kinds={KINDS}
      canRequest
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => response(201, { ok: true, id: "new" })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the two groups", () => {
  it("separates outstanding from resolved, and says how many are outstanding", () => {
    renderList();

    const outstanding = screen.getByRole("region", { name: /outstanding/i });
    expect(within(outstanding).getByText("Passport bio page")).toBeInTheDocument();
    expect(within(outstanding).queryByText("Father's bank statement")).not.toBeInTheDocument();

    const resolved = screen.getByRole("region", { name: /resolved/i });
    expect(within(resolved).getByText("Father's bank statement")).toBeInTheDocument();
  });

  it("shows the note and the due date on an outstanding request", () => {
    renderList();

    expect(screen.getByText("Colour scan, all four corners visible.")).toBeInTheDocument();
    // The date is what makes the list a CHASE list rather than an inventory.
    expect(screen.getByText(/due 1 september 2026/i)).toBeInTheDocument();
  });

  it("says the case is clear when there is nothing outstanding, without claiming nothing was ever asked", () => {
    renderList({ requests: [RESOLVED] });

    expect(screen.getByText(/nothing is outstanding/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /resolved/i })).toBeInTheDocument();
  });

  it("an empty case says nothing has been asked for yet — a different sentence entirely", () => {
    renderList({ requests: [] });

    expect(screen.getByText(/nothing has been asked for yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /resolved/i })).not.toBeInTheDocument();
  });
});

describe("resolving", () => {
  it("PATCHes the request under THIS case's path", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /mark received/i }));

    expect(fetch).toHaveBeenCalledWith(
      `/api/cases/${CASE}/document-requests/req-out`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      }),
    );
  });

  it("refreshes on success so the row moves groups", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ok: true })));
    renderList();

    await user.click(screen.getByRole("button", { name: /mark received/i }));

    expect(refresh).toHaveBeenCalled();
  });

  it("announces a failure instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response(403, { error: "Forbidden" })));
    renderList();

    await user.click(screen.getByRole("button", { name: /mark received/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a resolved request carries no button — there is nothing left to do to it", () => {
    renderList({ requests: [RESOLVED] });

    expect(screen.queryByRole("button", { name: /mark received/i })).not.toBeInTheDocument();
  });
});

describe("asking for something", () => {
  it("POSTs the kind, the title, the note and the due date", async () => {
    const user = userEvent.setup();
    renderList({ requests: [] });

    await user.selectOptions(screen.getByLabelText(/document/i), "bank-statement");
    await user.clear(screen.getByLabelText(/what to ask for/i));
    await user.type(screen.getByLabelText(/what to ask for/i), "Father's bank statement");
    await user.type(screen.getByLabelText(/note/i), "Last six months.");
    await user.type(screen.getByLabelText(/due/i), "2026-09-01");
    await user.click(screen.getByRole("button", { name: /ask for this/i }));

    expect(fetch).toHaveBeenCalledWith(
      `/api/cases/${CASE}/document-requests`,
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({
      kind: "bank-statement",
      title: "Father's bank statement",
      note: "Last six months.",
      // A date input gives a calendar day; the column is `timestamptz` and the
      // schema wants an instant, so the form sends one rather than making the route
      // guess a timezone.
      dueAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("fills the title from the chosen document, and lets it be overridden", async () => {
    const user = userEvent.setup();
    renderList({ requests: [] });

    // A required field the person has to retype from the dropdown they just used is
    // friction with no purpose; the override is what makes `title` worth having as
    // its own column ("Father's bank statement" vs "Applicant's").
    expect(screen.getByLabelText(/what to ask for/i)).toHaveValue("Passport bio page");
    await user.selectOptions(screen.getByLabelText(/document/i), "bank-statement");
    expect(screen.getByLabelText(/what to ask for/i)).toHaveValue("Bank Statement");
  });

  it("omits an empty note and an empty due date rather than sending blanks", async () => {
    const user = userEvent.setup();
    renderList({ requests: [] });

    await user.click(screen.getByRole("button", { name: /ask for this/i }));

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ kind: "passport", title: "Passport bio page", note: null, dueAt: null });
  });

  it("announces a failure and does not refresh", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response(500, {})));
    renderList({ requests: [] });

    await user.click(screen.getByRole("button", { name: /ask for this/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a viewer who may not request sees the list and no form", () => {
    renderList({ canRequest: false });

    expect(screen.getByText("Passport bio page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ask for this/i })).not.toBeInTheDocument();
    // And no resolve control either: both verbs are the same claim.
    expect(screen.queryByRole("button", { name: /mark received/i })).not.toBeInTheDocument();
  });
});
