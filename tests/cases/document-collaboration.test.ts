import { describe, it, expect } from "vitest";

import {
  REQUEST_PROGRESS_STATES,
  REQUEST_PROGRESS_WORD,
  REQUEST_PROGRESS_SENTENCE,
  deriveRequestProgress,
  newestFirst,
  type CaseDocumentReviewRow,
  type CaseDocumentVersionRow,
} from "@/lib/cases/document-collaboration";

/**
 * MV-186 — the five display states (spec §7.1, D6).
 *
 * ## Why this derivation exists at all
 *
 * `case_document_requests.status` is `outstanding | resolved`, written by
 * `private.sync_document_request_status` from the newest version's newest review.
 * It is correct, and it is LOSSY: three human states collapse into `outstanding`
 * and two into `resolved`. The one that matters is "a file arrived and is waiting
 * on OUR review" — a request in that state reads as `outstanding`, and a chase list
 * built on the column alone would tell a counsellor to chase the student for a
 * document sitting in the counsellor's own queue.
 *
 * So this module derives five states from the rows themselves. It never WRITES
 * `status`: the two `after insert` triggers do, and `guard_document_request_status`
 * refuses a contradicting hand-written value with `23514`.
 *
 * ## The ordering is the same ordering, or the UI disagrees with the trigger
 *
 * The SQL derivation is `order by created_at desc, id desc limit 1` on both tables,
 * and its header says why the `id` tiebreak is not decoration: two rows written in
 * one statement share a timestamp to the microsecond. A UI that sorted on
 * `created_at` alone would render a state the database disagrees with, on a case
 * nobody had touched. `newestFirst` is that comparator, and the tests below use
 * fixtures where the timestamps are EQUAL — otherwise the tiebreak is never
 * exercised and the assertion passes with or without it.
 */

const REQUEST = { id: "req-1", status: "outstanding" };
const OTHER_REQUEST_ID = "req-2";

function version(over: Partial<CaseDocumentVersionRow> = {}): CaseDocumentVersionRow {
  return {
    id: "ver-1",
    requestId: REQUEST.id,
    storagePath: "case/11111111-1111-4111-8111-111111111111/ver-1",
    fileSize: 1024,
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

describe("deriveRequestProgress — the five states", () => {
  it("is awaiting-upload when nothing has arrived", () => {
    const progress = deriveRequestProgress(REQUEST, [], []);
    expect(progress.state).toBe("awaiting-upload");
    expect(progress.newestVersion).toBeNull();
    expect(progress.versionCount).toBe(0);
  });

  it("is awaiting-review when a file arrived and nobody has judged it", () => {
    const progress = deriveRequestProgress(REQUEST, [version()], []);
    // The state `status` cannot express, and the whole reason this module exists:
    // the request reads `outstanding`, but the work is OURS, not the student's.
    expect(progress.state).toBe("awaiting-review");
    expect(progress.newestVersion?.id).toBe("ver-1");
    expect(progress.newestReview).toBeNull();
  });

  it("is accepted when the newest version's newest review accepted it", () => {
    const progress = deriveRequestProgress(REQUEST, [version()], [review({ decision: "accepted" })]);
    expect(progress.state).toBe("accepted");
    expect(progress.newestReview?.decision).toBe("accepted");
  });

  it("is rejected when the newest version's newest review rejected it", () => {
    const progress = deriveRequestProgress(
      REQUEST,
      [version()],
      [review({ decision: "rejected", note: "Page is cut off" })],
    );
    expect(progress.state).toBe("rejected");
    expect(progress.newestReview?.note).toBe("Page is cut off");
  });

  it("is received-by-hand when the request resolved with NO versions at all", () => {
    // MV-182's manual verb, still live. §5's derivation deliberately abstains here
    // (it returns NULL), so `status` is whatever the counsellor wrote.
    const progress = deriveRequestProgress({ id: "req-1", status: "resolved" }, [], []);
    expect(progress.state).toBe("received-by-hand");
    expect(progress.newestVersion).toBeNull();
  });

  it("never calls a received-by-hand request `accepted` — nobody checked a file", () => {
    const progress = deriveRequestProgress({ id: "req-1", status: "resolved" }, [], []);
    expect(progress.state).not.toBe("accepted");
    expect(REQUEST_PROGRESS_WORD[progress.state].toLowerCase()).not.toContain("accept");
    expect(REQUEST_PROGRESS_SENTENCE[progress.state].toLowerCase()).not.toContain("accept");
  });
});

describe("deriveRequestProgress — newest is (created_at, id) DESC, as the SQL says", () => {
  it("judges the NEWEST version, not the first one it was handed", () => {
    const older = version({ id: "ver-old", createdAt: "2026-08-19T10:00:00.000Z" });
    const newer = version({ id: "ver-new", createdAt: "2026-08-21T10:00:00.000Z" });
    // Handed oldest-last, so a function that took `[0]` would pick the older one.
    const progress = deriveRequestProgress(REQUEST, [newer, older], []);
    expect(progress.newestVersion?.id).toBe("ver-new");
    expect(progress.versionCount).toBe(2);
  });

  it("breaks a timestamp TIE on id, descending", () => {
    // EQUAL timestamps — the case the `id` tiebreak exists for. With fixtures whose
    // timestamps differ, this assertion passes whether or not the tiebreak is there.
    const SAME = "2026-08-20T10:00:00.000Z";
    const a = version({ id: "ver-aaa", createdAt: SAME });
    const b = version({ id: "ver-bbb", createdAt: SAME });
    expect(deriveRequestProgress(REQUEST, [a, b], []).newestVersion?.id).toBe("ver-bbb");
    // Input order must not decide it — that is exactly the drift the tiebreak prevents.
    expect(deriveRequestProgress(REQUEST, [b, a], []).newestVersion?.id).toBe("ver-bbb");
  });

  it("judges by the NEWEST review, so accept-then-reject is rejected", () => {
    // The migration: "a reviewer who accepts and then rejects has rejected, and
    // `exists (… 'accepted')` would call that resolved forever."
    const progress = deriveRequestProgress(
      REQUEST,
      [version()],
      [
        review({ id: "rev-1", decision: "accepted", createdAt: "2026-08-20T11:00:00.000Z" }),
        review({ id: "rev-2", decision: "rejected", createdAt: "2026-08-20T12:00:00.000Z" }),
      ],
    );
    expect(progress.state).toBe("rejected");
  });

  it("breaks a review timestamp TIE on id, descending", () => {
    const SAME = "2026-08-20T11:00:00.000Z";
    const progress = deriveRequestProgress(
      REQUEST,
      [version()],
      [
        review({ id: "rev-aaa", decision: "accepted", createdAt: SAME }),
        review({ id: "rev-bbb", decision: "rejected", createdAt: SAME }),
      ],
    );
    expect(progress.state).toBe("rejected");
  });

  it("newestFirst sorts descending on createdAt, then on id", () => {
    const rows = [
      { id: "b", createdAt: "2026-08-20T10:00:00.000Z" },
      { id: "c", createdAt: "2026-08-21T10:00:00.000Z" },
      { id: "a", createdAt: "2026-08-20T10:00:00.000Z" },
    ];
    expect([...rows].sort(newestFirst).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("deriveRequestProgress — rows belonging to other requests never leak in", () => {
  it("ignores a version hung off a DIFFERENT request", () => {
    const mine = version({ id: "ver-mine", createdAt: "2026-08-19T10:00:00.000Z" });
    const theirs = version({
      id: "ver-theirs",
      requestId: OTHER_REQUEST_ID,
      createdAt: "2026-08-21T10:00:00.000Z",
    });
    // `theirs` is NEWER, so a function that failed to filter would return it.
    const progress = deriveRequestProgress(REQUEST, [mine, theirs], []);
    expect(progress.newestVersion?.id).toBe("ver-mine");
    expect(progress.versionCount).toBe(1);
  });

  it("ignores a review of a DIFFERENT version", () => {
    const progress = deriveRequestProgress(
      REQUEST,
      [version({ id: "ver-1" })],
      [review({ id: "rev-other", versionId: "ver-somewhere-else", decision: "accepted" })],
    );
    // A review of another version must not resolve this one — the same parentage
    // bound the INSERT policy's third conjunct enforces at the database.
    expect(progress.state).toBe("awaiting-review");
    expect(progress.newestReview).toBeNull();
  });
});

describe("deriveRequestProgress — a re-upload after a rejection", () => {
  it("returns to awaiting-review when a NEWER version arrives after a rejection", () => {
    // The whole point of the model: "re-upload after a rejection is the point"
    // (no `unique (request_id)`), and the trigger re-opens the request.
    const rejected = version({ id: "ver-1", createdAt: "2026-08-20T10:00:00.000Z" });
    const replacement = version({ id: "ver-2", createdAt: "2026-08-21T10:00:00.000Z" });
    const progress = deriveRequestProgress(
      REQUEST,
      [rejected, replacement],
      [review({ versionId: "ver-1", decision: "rejected", createdAt: "2026-08-20T11:00:00.000Z" })],
    );
    expect(progress.state).toBe("awaiting-review");
    expect(progress.newestVersion?.id).toBe("ver-2");
    // The old rejection is history, not the current judgement.
    expect(progress.newestReview).toBeNull();
    expect(progress.versionCount).toBe(2);
  });
});

describe("deriveRequestProgress — an unrecognised decision never reads as acceptance", () => {
  it("treats a decision that is not `accepted` as not accepted, mirroring the SQL", () => {
    // The SQL is `when (…) = 'accepted' then 'resolved' else 'outstanding'` — read
    // POSITIVELY, so a value added later cannot silently become an acceptance. The
    // check constraint admits only two values today; if a third ever arrives it must
    // fall to the conservative side, which is the one that claims nothing.
    const progress = deriveRequestProgress(
      REQUEST,
      [version()],
      [review({ decision: "something-new" })],
    );
    expect(progress.state).not.toBe("accepted");
  });
});

describe("the copy each state carries", () => {
  it("gives every state a word and a sentence", () => {
    expect(REQUEST_PROGRESS_STATES.length).toBe(5);
    for (const state of REQUEST_PROGRESS_STATES) {
      expect(REQUEST_PROGRESS_WORD[state], state).toBeTruthy();
      expect(REQUEST_PROGRESS_SENTENCE[state], state).toBeTruthy();
    }
  });

  it("gives every state a DISTINCT word — two states sharing one word is one state", () => {
    const words = REQUEST_PROGRESS_STATES.map((s) => REQUEST_PROGRESS_WORD[s]);
    expect(new Set(words).size).toBe(words.length);
  });

  it("claims nothing was verified, approved or ready in any state's copy", () => {
    // The same honesty bound MV-183 holds on the lodgement panel. A review
    // establishes that ONE counsellor accepted ONE file — not that a case is ready,
    // and not that anything was independently verified.
    const CLAIM = /\bready\b|\bverified\b|\bapproved\b|\bsubmittable\b|\blodged?\b|\bcomplete\b/i;
    for (const state of REQUEST_PROGRESS_STATES) {
      expect(REQUEST_PROGRESS_WORD[state], state).not.toMatch(CLAIM);
      expect(REQUEST_PROGRESS_SENTENCE[state], state).not.toMatch(CLAIM);
    }
  });

  it("says out loud that a received-by-hand request was never checked", () => {
    expect(REQUEST_PROGRESS_SENTENCE["received-by-hand"]).toMatch(/nothing has been checked/i);
  });

  it("instructs NOBODY to upload — half the readers cannot", () => {
    // This table already says of itself that it is "ACTOR-NEUTRAL on purpose", and
    // MV-195 made that claim load-bearing rather than aspirational:
    // `app/(app)/(student)/consultancy/[caseId]/page.tsx` renders these sentences to
    // the LINKED STUDENT, who holds no INSERT on any of the three collaboration
    // tables — every one of those policies rides `private.can_staff_case`, which is
    // `can_access_case` MINUS the student disjunct.
    //
    // So "Uploading a new one replaces it" was an instruction half the readers cannot
    // follow, on the one state where they most want to act — and the same page says
    // "You can't upload a file here yet" a few elements below it. The slice refused an
    // upload BUTTON on the reasoning that it "would tell the student they were
    // allowed"; a sentence that says so is the same defect without the control.
    //
    // `\bupload\b` deliberately does NOT match "uploaded": "No file was uploaded here"
    // reports what happened rather than asking anybody for anything.
    const INSTRUCTS = /\bupload\b|\buploading\b|\byou\b|\byour\b/i;
    for (const state of REQUEST_PROGRESS_STATES) {
      expect(REQUEST_PROGRESS_SENTENCE[state], state).not.toMatch(INSTRUCTS);
    }
  });
});
