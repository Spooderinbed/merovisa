/**
 * The document collaboration read (MV-186, spec §7.1 D6) — the pure derivation
 * behind the Documents page: **what has actually happened to this request, and who
 * is it waiting on.**
 *
 * `lib/cases/document-collaboration-repo.ts` fetches the rows, this module decides
 * what they mean, and the components render THIS answer. The same split MV-183 used
 * for lodgement, for the same reason: one derivation is why two surfaces can never
 * disagree about one request.
 *
 * DELIBERATELY NOT `server-only`. Nothing here is a scoring rule or a permission —
 * it is what the surface says out loud, and the client component that renders a
 * version list needs the same words. `./lodgement.ts` and `./queue.ts` state the
 * same. (MV-169 leaked the permission matrix into the browser bundle through a
 * client component importing a `lib/` module; the rule is that what crosses the
 * boundary must be safe to cross it, not that nothing crosses.)
 *
 * ## Why this module exists at all: `status` is correct, and lossy
 *
 * `case_document_requests.status` is `outstanding | resolved`, written by
 * `private.sync_document_request_status` in the same statement that inserts a
 * version or a review. It is the column MV-183's lodgement panel reads and it stays
 * that way. But it compresses five human states into two:
 *
 * | what happened                                   | `status`      |
 * |-------------------------------------------------|---------------|
 * | nothing has arrived                              | `outstanding` |
 * | a file arrived, nobody has judged it             | `outstanding` |
 * | a file arrived and was rejected                  | `outstanding` |
 * | a file arrived and was accepted                  | `resolved`    |
 * | no file ever arrived, marked received by hand    | `resolved`    |
 *
 * The second row is the expensive one. A chase list built on the column alone tells
 * a counsellor "outstanding" about a document sitting in the counsellor's OWN review
 * queue — it points the chase at the wrong person, which is the one thing a chase
 * list must never do.
 *
 * ## This module never writes `status`, and could not if it tried
 *
 * The two `after insert` triggers write it, and `private.guard_document_request_status`
 * refuses a contradicting hand-written value with a `23514`. So this is a READ of the
 * same facts the trigger reads, never a second source of truth — which is why the
 * ordering below has to match the SQL's exactly.
 */

/** One arrived file. A structural subset of the `case_document_versions` row. */
export interface CaseDocumentVersionRow {
  id: string;
  requestId: string;
  storagePath: string;
  fileSize: number;
  originalName: string;
  contentType: string | null;
  createdAt: string;
}

/** One judgement on one file. A structural subset of the `case_document_reviews` row. */
export interface CaseDocumentReviewRow {
  id: string;
  versionId: string;
  decision: string;
  note: string | null;
  createdAt: string;
}

export const REQUEST_PROGRESS_STATES = [
  "awaiting-upload",
  "awaiting-review",
  "rejected",
  "accepted",
  "received-by-hand",
] as const;

export type RequestProgressState = (typeof REQUEST_PROGRESS_STATES)[number];

/**
 * The word each state wears. Distinct per state — two states sharing a word is one
 * state with extra steps, and a named test pins the distinctness.
 *
 * NONE of them claims a case is ready, verified, approved or complete. A review
 * establishes that one counsellor accepted one file; it does not establish anything
 * about the case, and this repo has reworked two surfaces that made the larger claim
 * on the smaller evidence (MV-143, MV-144).
 */
export const REQUEST_PROGRESS_WORD: Record<RequestProgressState, string> = {
  "awaiting-upload": "Nothing received",
  "awaiting-review": "Awaiting review",
  rejected: "Rejected",
  accepted: "Accepted",
  // NOT "Accepted", and not sharing its colour either. Nobody checked a file here,
  // because there is no file.
  "received-by-hand": "Received by hand",
};

/**
 * The sentence under the word.
 *
 * ACTOR-NEUTRAL on purpose. A linked student reads this surface too (spec §7.2 D7 —
 * `_select_actor` rides `actor_case_ids()`), so "waiting on your review" would be
 * false for half the readers. Stating what happened rather than whose turn it is
 * keeps one copy table honest for both.
 */
export const REQUEST_PROGRESS_SENTENCE: Record<RequestProgressState, string> = {
  "awaiting-upload": "Nothing has arrived against this request yet.",
  "awaiting-review": "A file has arrived and has not been reviewed yet.",
  rejected: "The newest file was rejected. Uploading a new one replaces it.",
  accepted: "The newest file was accepted.",
  "received-by-hand":
    "Marked received by hand. No file was uploaded here, so nothing has been checked.",
};

/** The tint each state carries. Design tokens only; the WORD is always the carrier. */
export const REQUEST_PROGRESS_TONE: Record<RequestProgressState, string> = {
  // Neutral, not Possible: "nothing has arrived" is the starting state of every
  // request and colouring it would make an untouched chase list look alarming.
  "awaiting-upload": "bg-bg-tint text-ink-soft",
  "awaiting-review": "bg-possible-tint text-possible-ink",
  rejected: "bg-reach-tint text-reach",
  accepted: "bg-strong-tint text-strong",
  // Neutral, NOT Strong. Strong is what a checked file earned; a counsellor's tick
  // that no file passed through must not borrow the colour of one that did.
  "received-by-hand": "bg-bg-tint text-ink-soft",
};

/** The two rows this module needs off a request. Structural, so the repo type fits. */
export interface ProgressRequestRow {
  id: string;
  status: string;
}

export interface RequestProgress {
  state: RequestProgressState;
  /** The file under judgement, or `null` when none has arrived. */
  newestVersion: CaseDocumentVersionRow | null;
  /** The judgement ON THAT VERSION, or `null` when nobody has judged it yet. */
  newestReview: CaseDocumentReviewRow | null;
  /** How many versions this request has accumulated. Never a denominator. */
  versionCount: number;
}

const RESOLVED = "resolved";
const ACCEPTED = "accepted";

/**
 * `(created_at, id)` DESCENDING — the same total order
 * `private.document_request_derived_status` uses on both tables, and for the reason
 * its header gives: two rows inserted in one statement share a timestamp to the
 * microsecond, so `created_at` alone is not a total order and the answer would
 * depend on which row the planner returned first.
 *
 * A UI sorting differently would render a state the trigger disagrees with, on a
 * case nobody had touched. The `id` tiebreak is arbitrary but TOTAL, which is the
 * only property required of it.
 */
export function newestFirst(
  a: { id: string; createdAt: string },
  b: { id: string; createdAt: string },
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * What has happened to one request.
 *
 * Takes the WHOLE case's versions and reviews and filters, rather than trusting a
 * caller to have pre-filtered. That is the same choice `selectLodgementBlocker`
 * makes, and it matters more here: passing another request's versions would render
 * one request's state onto another, and the parentage bound that stops it at the
 * database (the INSERT policy's third conjunct) has no equivalent in a component.
 */
export function deriveRequestProgress(
  request: ProgressRequestRow,
  versions: readonly CaseDocumentVersionRow[],
  reviews: readonly CaseDocumentReviewRow[],
): RequestProgress {
  // `[...]` before `.sort()` — the caller's array is not ours to reorder.
  const mine = [...versions.filter((v) => v.requestId === request.id)].sort(newestFirst);
  const newestVersion = mine[0] ?? null;

  if (newestVersion === null) {
    return {
      // A request with no versions is one the derivation ABSTAINS on (§5 returns
      // NULL), so `status` here is whatever a human wrote — and `resolved` can only
      // have come from MV-182's manual verb.
      state: request.status === RESOLVED ? "received-by-hand" : "awaiting-upload",
      newestVersion: null,
      newestReview: null,
      versionCount: 0,
    };
  }

  const judgements = [...reviews.filter((r) => r.versionId === newestVersion.id)].sort(newestFirst);
  const newestReview = judgements[0] ?? null;

  return {
    state:
      newestReview === null
        ? "awaiting-review"
        : // Read POSITIVELY, mirroring the SQL's `when (…) = 'accepted' … else …`.
          // The check constraint admits only two values today; if a third ever
          // arrives it falls to the side that claims nothing, which is the only
          // safe default on a trust surface.
          newestReview.decision === ACCEPTED
          ? "accepted"
          : "rejected",
    newestVersion,
    newestReview,
    versionCount: mine.length,
  };
}

/**
 * Every version of one request, newest first — the history list.
 *
 * Separate from `deriveRequestProgress` because the panel needs the head and the
 * list needs the whole thing, and deriving the order twice is how two surfaces
 * start disagreeing about which file is current.
 */
export function versionsForRequest(
  requestId: string,
  versions: readonly CaseDocumentVersionRow[],
): CaseDocumentVersionRow[] {
  return [...versions.filter((v) => v.requestId === requestId)].sort(newestFirst);
}

/**
 * Every review of one version, newest first. The head is the judgement; the tail is
 * history, and the model admits several on purpose ("a reviewer who rejected in
 * error must be able to say so").
 */
export function reviewsForVersion(
  versionId: string,
  reviews: readonly CaseDocumentReviewRow[],
): CaseDocumentReviewRow[] {
  return [...reviews.filter((r) => r.versionId === versionId)].sort(newestFirst);
}

/**
 * May MV-182's manual "Mark received" verb be offered for this request?
 *
 * ONLY when no version exists. Once one does, `private.guard_document_request_status`
 * refuses any hand-written status that contradicts the derivation with a `23514` —
 * so the control could only ever produce a failed write. A control that appears and
 * then fails is worse than an absent one: it tells the person they were allowed.
 */
export function canResolveByHand(progress: RequestProgress): boolean {
  return progress.versionCount === 0;
}
