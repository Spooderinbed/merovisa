/**
 * The lodgement read (MV-183, spec §2 "Current and future columns" + §3
 * "Submittability read") — the pure derivation behind the first surface that
 * answers the question the consultancy product is sold on: **which case is
 * blocked, and what single item is blocking it.**
 *
 * `lib/cases/document-requests-repo.ts` fetches the rows, this module decides what
 * they mean, and the queue column and the case panel both render THIS answer. One
 * derivation is the reason those two surfaces can never disagree about one case —
 * the same rule `./queue.ts` states for the next action.
 *
 * DELIBERATELY NOT `server-only`, for `./queue.ts`'s reason: nothing here is a
 * scoring rule or a permission — it is what the surface says out loud.
 *
 * ## The honesty boundary, which is the whole reason this file is careful
 *
 * Zero outstanding requests means **nothing the consultancy has asked for is
 * outstanding**. It does NOT mean the case is submittable:
 *
 * - No document has been verified by anyone. Stage 4 slice 1 built a CHASE LIST,
 *   not a review model — `case_document_requests` has `outstanding` and `resolved`
 *   and nothing that means "checked" (see the migration, which says so out loud).
 * - The list is only as complete as the counsellor made it. Nothing in the schema
 *   knows which documents this case actually needs, so there is no denominator —
 *   which is exactly why spec §3 forbids a completion percentage "unless Stage 4
 *   establishes a truthful denominator". It has not.
 *
 * So the word for a fully-chased case is "Nothing outstanding" and not "Ready to
 * lodge": the first is a statement about the REQUESTS, which is what we know, and
 * the second is a statement about the CASE, which we do not. This repo has shipped
 * two surfaces that made the larger claim on the smaller evidence — MV-143's
 * abstain gate and MV-144's "accuracy" meter — and reworked both.
 *
 * ## Four states, and why two of them look alike
 *
 * - `blocked` — at least one outstanding request. Names ONE item (spec §3: "the
 *   single item preventing lodgement") and counts the rest, so nobody reads one
 *   named item as the whole of the work.
 * - `clear` — requests were made and every one of them resolved.
 * - `nothing-requested` — no request was ever made. NOT `clear`: an untouched case
 *   must not borrow the word a fully-chased case earned, and the colour difference
 *   (Strong vs Possible) is the difference between "you are done chasing" and "you
 *   have not started".
 * - `none-outstanding` — nothing is outstanding, and whether anything was ever
 *   requested is UNKNOWN. This is the queue's state, and it exists because the
 *   queue reads outstanding rows only: `case_document_requests` keeps resolved rows
 *   forever, so a forty-case batch that fetched every status could silently exceed
 *   PostgREST's `max_rows` and turn the whole column into an outage. The queue
 *   therefore says the weaker true thing rather than guessing the stronger one, and
 *   shares `clear`'s words because they are equally true — only its colour is
 *   neutral rather than Strong.
 */

/** The columns the derivation reads. A subset of `CaseDocumentRequest`, structurally. */
export interface LodgementRequestRow {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
}

/** The one item a surface may name. `dueAt` travels so the panel can date it. */
export interface LodgementBlocker {
  id: string;
  title: string;
  dueAt: string | null;
}

export const LODGEMENT_STATES = [
  "blocked",
  "clear",
  "nothing-requested",
  "none-outstanding",
] as const;

export type LodgementState = (typeof LODGEMENT_STATES)[number];

/**
 * The read word (spec §2: "Read word plus the single blocking item"). It lives in
 * the pure module rather than in either component because the queue and the panel
 * must say the same word about the same case — `./queue.ts` keeps the next-action
 * sentences here for the same reason.
 *
 * NONE of these words claims the case is ready, verified, complete or submittable.
 * A named test asserts that, so the claim cannot creep back in during a copy edit.
 */
export const LODGEMENT_WORD: Record<LodgementState, string> = {
  blocked: "Blocked",
  clear: "Nothing outstanding",
  "nothing-requested": "Nothing requested yet",
  "none-outstanding": "Nothing outstanding",
};

/**
 * The read, or its absence.
 *
 * `unavailable` is a read that FAILED, and it is a state rather than a `null`
 * because the two are not the same fact: a failed read must present as an outage
 * and must never present as a good state (spec §5 — "filter/count enrichment
 * failure must not silently show zero"). A caller with no read AT ALL passes
 * nothing, and the decision strip renders nothing; a caller whose read failed
 * passes this, and the panel says so.
 */
export type LodgementRead =
  | { state: "blocked"; blocker: LodgementBlocker; otherOutstanding: number }
  | { state: "clear" }
  | { state: "nothing-requested" }
  | { state: "none-outstanding" }
  | { state: "unavailable" };

const OUTSTANDING = "outstanding";

/**
 * Soonest-due first, undated last, oldest ask breaking a tie — the same order
 * `listCaseDocumentRequests` asks Postgres for, restated here because the queue's
 * batched read serves many cases from one result set and cannot lean on a single
 * `ORDER BY`.
 *
 * The final `id` comparison is not decoration: without it two requests created in
 * the same transaction with the same due date would resolve to whichever row
 * PostgREST happened to return first, and "the single blocking item" would change
 * between two renders of an unchanged case.
 */
function byUrgency(a: LodgementRequestRow, b: LodgementRequestRow): number {
  if (a.dueAt !== b.dueAt) {
    // A dated ask always outranks an undated one, whatever the date.
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function outstandingOf(requests: readonly LodgementRequestRow[]): LodgementRequestRow[] {
  // Anything that is not `outstanding` is not blocking. Reading the column
  // positively rather than excluding `resolved` means a status added later cannot
  // silently become a blocker.
  return requests.filter((request) => request.status === OUTSTANDING);
}

/**
 * The single item preventing lodgement, or `null` when nothing is outstanding.
 *
 * Takes the whole list and filters, so a caller cannot accidentally pass a resolved
 * request as a blocker.
 */
export function selectLodgementBlocker(
  requests: readonly LodgementRequestRow[],
): LodgementBlocker | null {
  // `[...]` before `.sort()` — the caller's array is not ours to reorder.
  const blocking = [...outstandingOf(requests)].sort(byUrgency);
  const first = blocking[0];
  if (first === undefined) return null;
  return { id: first.id, title: first.title, dueAt: first.dueAt };
}

function blocked(outstanding: LodgementRequestRow[]): LodgementRead | null {
  const sorted = [...outstanding].sort(byUrgency);
  const first = sorted[0];
  if (first === undefined) return null;
  return {
    state: "blocked",
    blocker: { id: first.id, title: first.title, dueAt: first.dueAt },
    // The OTHERS, not the total. A count of what else is outstanding stops a reader
    // treating one named item as the whole of the work, and it names no denominator
    // — there is no truthful "of N" to name.
    otherOutstanding: sorted.length - 1,
  };
}

/**
 * The case panel's read, derived from the case's WHOLE request list.
 *
 * Having every row is what lets this distinguish `clear` from `nothing-requested`,
 * which the queue cannot.
 */
export function deriveLodgement(requests: readonly LodgementRequestRow[]): LodgementRead {
  const outstanding = outstandingOf(requests);
  return blocked(outstanding) ?? (requests.length === 0
    ? { state: "nothing-requested" }
    : { state: "clear" });
}

/**
 * The queue column's read, derived from OUTSTANDING rows only.
 *
 * The absence of outstanding rows is reported as `none-outstanding` rather than
 * `clear` because this input cannot tell an all-resolved case from one nobody has
 * asked anything of.
 */
export function deriveQueueLodgement(outstanding: readonly LodgementRequestRow[]): LodgementRead {
  return blocked(outstandingOf(outstanding)) ?? { state: "none-outstanding" };
}
