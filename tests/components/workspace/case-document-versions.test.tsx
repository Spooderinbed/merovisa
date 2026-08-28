import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CaseDocumentVersions } from "@/components/workspace/case-document-versions";
import {
  deriveRequestProgress,
  type CaseDocumentReviewRow,
  type CaseDocumentVersionRow,
} from "@/lib/cases/document-collaboration";

/**
 * MV-186 — one request's collaboration block.
 *
 * Most of what is asserted here is what the component must NOT render:
 *
 * - **No delete-a-version and no edit-a-review control, in any state.** Both tables are
 *   append-only to a client — MV-185 grants no UPDATE and no DELETE on either and asserts both
 *   absences at apply time — so either control could only ever produce a `42501`.
 * - **No review verb and no upload control for a linked student.** They genuinely reach this
 *   surface (`case.read` at `linked` passes `openCaseRoute`), and RLS refuses their write
 *   through `can_staff_case`. Rendering the verb anyway would tell them they were allowed.
 * - **No review verb on an OLDER version**, because the derivation judges the newest one and a
 *   review the state then ignores is a control whose effect is invisible.
 */

const CASE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

function version(over: Partial<CaseDocumentVersionRow> = {}): CaseDocumentVersionRow {
  return {
    id: "ver-1",
    requestId: REQUEST_ID,
    storagePath: `case/${CASE_ID}/ver-1`,
    fileSize: 2048,
    originalName: "passport.pdf",
    contentType: "application/pdf",
    createdAt: "2026-08-20T10:00:00.000Z",
    ...over,
  };
}

function review(over: Partial<CaseDocumentReviewRow> = {}): CaseDocumentReviewRow {
  return {
    id: "rev-1",
    versionId: "ver-1",
    decision: "accepted",
    note: null,
    createdAt: "2026-08-20T11:00:00.000Z",
    ...over,
  };
}

function renderBlock({
  status = "outstanding",
  versions = [] as CaseDocumentVersionRow[],
  reviews = [] as CaseDocumentReviewRow[],
  canUpload = true,
  canReview = true,
} = {}) {
  const progress = deriveRequestProgress({ id: REQUEST_ID, status }, versions, reviews);
  return {
    progress,
    ...render(
      <CaseDocumentVersions
        caseId={CASE_ID}
        requestId={REQUEST_ID}
        progress={progress}
        versions={versions}
        reviews={reviews}
        canUpload={canUpload}
        canReview={canReview}
      />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true, url: "https://signed/x" }), { status: 200 })),
  );
  vi.stubGlobal("open", vi.fn());
});

describe("the five states each say a distinct thing", () => {
  it("says nothing has arrived when there are no versions", () => {
    renderBlock();
    expect(screen.getByText(/nothing has arrived against this request yet/i)).toBeTruthy();
  });

  it("says a file is waiting to be reviewed", () => {
    renderBlock({ versions: [version()] });
    expect(screen.getByText(/has not been reviewed yet/i)).toBeTruthy();
  });

  it("says the newest file was accepted", () => {
    renderBlock({ versions: [version()], reviews: [review({ decision: "accepted" })] });
    expect(screen.getByText(/the newest file was accepted/i)).toBeTruthy();
  });

  it("says the newest file was rejected, and that a newer file would replace it", () => {
    renderBlock({ versions: [version()], reviews: [review({ decision: "rejected" })] });
    // MV-195 made this sentence actor-neutral: the same copy table faces the LINKED
    // STUDENT, who cannot upload at all. The counsellor loses nothing — the upload
    // control is rendered right below this line, which is what makes the instruction
    // redundant here and false there.
    expect(screen.getByText(/rejected\. a newer file would replace it/i)).toBeTruthy();
  });

  it("says a received-by-hand request was NEVER CHECKED, and never calls it accepted", () => {
    const { container } = renderBlock({ status: "resolved" });
    expect(screen.getByText(/no file was uploaded here, so nothing has been checked/i)).toBeTruthy();
    // The distinction the whole state exists for: a counsellor's tick is not a review.
    expect(container.textContent ?? "").not.toMatch(/\baccepted\b/i);
  });
});

describe("the rejection note reaches the reader", () => {
  it("shows the reason a file was rejected", () => {
    renderBlock({
      versions: [version()],
      reviews: [review({ decision: "rejected", note: "The bottom of the page is cut off" })],
    });
    // MV-185: "'rejected' with no note is a wall". This is the half of the model that is any
    // use to the student, which is why `_select_actor` rides the case axis.
    expect(screen.getByText(/the bottom of the page is cut off/i)).toBeTruthy();
  });

  it("shows it to a LINKED STUDENT too, who can do nothing else here", () => {
    renderBlock({
      versions: [version()],
      reviews: [review({ decision: "rejected", note: "Blurry scan" })],
      canUpload: false,
      canReview: false,
    });
    expect(screen.getByText(/blurry scan/i)).toBeTruthy();
  });
});

describe("the append-only fence — no control the grants cannot serve", () => {
  const STATES = [
    { label: "no versions", args: {} },
    { label: "awaiting review", args: { versions: [version()] } },
    {
      label: "accepted",
      args: { versions: [version()], reviews: [review({ decision: "accepted" })] },
    },
    {
      label: "rejected",
      args: { versions: [version()], reviews: [review({ decision: "rejected" })] },
    },
    { label: "received by hand", args: { status: "resolved" } },
  ];

  it("offers NO delete and NO edit control in any state", () => {
    for (const state of STATES) {
      const { container, unmount } = renderBlock(state.args);
      const labels = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
      // MV-185 grants no UPDATE and no DELETE on either table and asserts both absences at
      // apply time, so either verb could only ever raise a `42501`.
      expect(labels.filter((l) => /delete|remove|edit|undo|change/i.test(l)), state.label).toEqual([]);
      unmount();
    }
  });
});

describe("a linked student sees the history and none of the verbs", () => {
  const studentArgs = {
    versions: [version()],
    reviews: [] as CaseDocumentReviewRow[],
    canUpload: false,
    canReview: false,
  };

  it("renders the file history", () => {
    renderBlock(studentArgs);
    expect(screen.getByRole("list", { name: /file history/i })).toBeTruthy();
    expect(screen.getByText("passport.pdf")).toBeTruthy();
  });

  it("renders NO accept and NO reject verb", () => {
    renderBlock(studentArgs);
    // Belt and braces: `can_staff_case` refuses the write at the database whatever this
    // renders, but a control that appears and then 403s tells the person they were allowed.
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
  });

  it("renders NO upload control and no file input", () => {
    const { container } = renderBlock(studentArgs);
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("renders NO review-note field — there is nothing for them to write", () => {
    const { container } = renderBlock(studentArgs);
    expect(container.querySelector('input[name="reviewNote"]')).toBeNull();
  });

  it("STILL lets them open the file — the read axis is theirs", () => {
    renderBlock(studentArgs);
    expect(screen.getByRole("button", { name: /open/i })).toBeTruthy();
  });
});

describe("a counsellor gets both verbs, on the newest version only", () => {
  const older = version({ id: "ver-old", createdAt: "2026-08-19T10:00:00.000Z" });
  const newer = version({ id: "ver-new", createdAt: "2026-08-21T10:00:00.000Z", originalName: "passport-v2.pdf" });

  it("offers accept and reject", () => {
    renderBlock({ versions: [version()] });
    expect(screen.getByRole("button", { name: /accept/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /reject/i })).toBeTruthy();
  });

  it("offers them on the NEWEST version and on no other", () => {
    const { container } = renderBlock({ versions: [older, newer] });
    const items = [...container.querySelectorAll("[data-version]")];
    expect(items).toHaveLength(2);
    // Newest first, so the verbs belong to the first row and to it alone. A review on an older
    // version is one the derivation ignores — an invisible effect, which is as bad as a failure.
    expect(within(items[0] as HTMLElement).queryByRole("button", { name: /accept/i })).toBeTruthy();
    expect(within(items[1] as HTMLElement).queryByRole("button", { name: /accept/i })).toBeNull();
    expect(within(items[1] as HTMLElement).queryByRole("button", { name: /reject/i })).toBeNull();
  });

  it("marks which file is the newest, so the state word has a referent", () => {
    const { container } = renderBlock({ versions: [older, newer] });
    const items = [...container.querySelectorAll("[data-version]")];
    expect((items[0] as HTMLElement).textContent).toMatch(/newest/i);
    expect((items[1] as HTMLElement).textContent).not.toMatch(/newest/i);
  });
});

describe("the writes go to the right routes", () => {
  it("POSTs a review with its decision and note", async () => {
    const user = userEvent.setup();
    renderBlock({ versions: [version()] });

    await user.type(screen.getByLabelText(/reason/i), "Page is cut off");
    await user.click(screen.getByRole("button", { name: /reject/i }));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(url).toBe(`/api/cases/${CASE_ID}/document-versions/ver-1/reviews`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      decision: "rejected",
      note: "Page is cut off",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("sends a blank note as NULL, never as an empty string", async () => {
    const user = userEvent.setup();
    renderBlock({ versions: [version()] });

    await user.click(screen.getByRole("button", { name: /accept/i }));

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(JSON.parse((init as RequestInit).body as string).note).toBeNull();
  });

  it("opens a version through the signed-download route, never a stored url", async () => {
    const user = userEvent.setup();
    renderBlock({ versions: [version()] });

    await user.click(screen.getByRole("button", { name: /open/i }));

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(url).toBe(`/api/cases/${CASE_ID}/document-versions/ver-1/download`);
    // `noopener` so a short-lived unauthenticated bearer of the bytes never reaches
    // `window.opener`.
    expect(globalThis.open).toHaveBeenCalledWith(
      "https://signed/x",
      "_blank",
      expect.stringContaining("noopener"),
    );
  });

  it("never renders a raw storage path — the client has no business holding one", () => {
    const { container } = renderBlock({ versions: [version()] });
    expect(container.innerHTML).not.toContain("case/");
  });

  it("says so when a review fails, rather than looking like it saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })),
    );
    const user = userEvent.setup();
    renderBlock({ versions: [version()] });

    await user.click(screen.getByRole("button", { name: /accept/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/not allowed/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("gives a rate-limited upload its own sentence, not a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const user = userEvent.setup();
    const { container } = renderBlock({ versions: [] });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    // 429 has no sentence in `saveErrorMessage` and would otherwise report a rate limit as
    // "we couldn't save that change".
    expect(screen.getByRole("alert").textContent).toMatch(/too many uploads/i);
  });

  it("POSTs the upload as multipart to the versions route", async () => {
    const user = userEvent.setup();
    const { container } = renderBlock({ versions: [] });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(url).toBe(`/api/cases/${CASE_ID}/document-requests/${REQUEST_ID}/versions`);
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    // No `caseId` in the body: the case is a PATH segment on this route, so there is no id for
    // a caller to get wrong (spec F-8).
    expect(((init as RequestInit).body as FormData).get("caseId")).toBeNull();
  });

  it("calls the upload control 'Upload a new version' once a file already arrived", () => {
    renderBlock({ versions: [version()] });
    // A rejected file is superseded, never edited — the label says which verb this is.
    expect(screen.getByRole("button", { name: /upload a new version/i })).toBeTruthy();
  });
});
