import Link from "next/link";
import { LODGEMENT_WORD, type LodgementRead, type LodgementState } from "@/lib/cases/lodgement";

/**
 * The submittability read (MV-183, spec §3 "Submittability read" and §4's
 * `submittability-panel.tsx` row) — half of the decision strip, and the first
 * surface in the product that answers "is this case blocked, and by what".
 *
 * ## What it may claim, and what it may not
 *
 * It reads `case_document_requests` and nothing else, so it may say only what
 * document requests know. Zero outstanding requests means nothing the consultancy
 * ASKED FOR is outstanding — it does not mean the case can be lodged, because
 * nothing in the schema knows which documents this case actually needs.
 *
 * ## What MV-186 changed here, and what it deliberately did not
 *
 * Until MV-186 the note said "Nothing here has been checked or approved", and that was
 * true: Stage 4 slice 1 shipped a chase list with no review model behind it. Reviews
 * now exist, so a `resolved` request MAY be one whose file a counsellor accepted —
 * and the old sentence became false in one direction.
 *
 * **The correction does not swing the other way, for a mechanical reason.** This panel
 * reads requests and NOTHING else: `readCaseLodgement` -> `listCaseDocumentRequests`
 * -> `deriveLodgement`, and it never loads a version or a review. So from
 * `status = 'resolved'` alone it cannot tell an accepted file from a request a
 * counsellor marked received BY HAND with no file at all — MV-182's manual verb is
 * still live and `private.document_request_derived_status` deliberately abstains on
 * it. "Every document has been checked" is therefore not a sentence this panel is
 * entitled to, and the note now says exactly which two things `resolved` can mean and
 * that the panel cannot tell them apart. The Documents page CAN (spec §7.1, D6), which
 * is what the link at the foot is for.
 *
 * The state words do not move. A rejected file derives `outstanding`, so `clear` still
 * means every request resolved, and the reassuring word stays "Nothing outstanding"
 * rather than "Ready to lodge". `lib/cases/lodgement.ts` carries the full reasoning.
 *
 * ## No completion percentage, count-of-total, or progress bar
 *
 * Spec §3: "No completion percentage unless Stage 4 establishes a truthful
 * denominator." It has not — there is no "documents needed" anywhere — so there is
 * no percentage, no "3 of 8", and no bar. The one number here is how many OTHER
 * requests are outstanding, which is a fact about a fully-known set and names no
 * total. It is present because a single named item, alone, reads as the whole of
 * the work.
 *
 * ## Colour never carries the meaning
 *
 * Strong for a chased case, Possible for an unasked one, Reach for a blocked one —
 * spec §3's mapping, "always accompanied by the state word". The word is the
 * carrier; the tint is the echo. An `unavailable` read gets NO band at all, because
 * an outage wearing a state's colour is a state.
 *
 * NOT `VerdictPill`: that is reserved for the VISA band (spec §4), and a lodgement
 * word dressed in it would read as a judgement about the student. Not
 * `CaseStatusPill` either — §4 assigns that to operational status.
 */

/** Spec §3's colour mapping. `unavailable` is absent by design — it has no band. */
const TONE: Record<LodgementState, string> = {
  blocked: "bg-reach-tint text-reach",
  clear: "bg-strong-tint text-strong",
  "nothing-requested": "bg-possible-tint text-possible-ink",
  // The queue's weaker state: nothing is outstanding, but whether anything was ever
  // requested is unknown, so it has not earned Strong.
  "none-outstanding": "bg-bg-tint text-ink-soft",
};

/**
 * The limit of the read, stated wherever the read is stated. Two clauses, and both are
 * load bearing: a `resolved` request has two possible meanings and this panel cannot
 * tell them apart, and nobody knows whether the list is complete.
 *
 * The second clause survives MV-186 unchanged in meaning, because nothing about reviews
 * gave Stage 4 a truthful DENOMINATOR — spec §3's ban on a percentage, an "x of y" and a
 * progress bar stands, and its three tests are untouched.
 */
const SCOPE_NOTE =
  "Read from document requests only. A resolved request means a file was accepted or a counsellor marked it received by hand, and this panel does not say which; the list is only as complete as the requests on it.";

export function SubmittabilityPanel({ read, base }: { read: LodgementRead; base: string }) {
  return (
    <section
      aria-label="Lodgement"
      className="flex flex-col gap-3 rounded-lg border border-line p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-caption uppercase tracking-wide text-ink-faint">Lodgement</h2>
        {read.state === "unavailable" ? null : (
          <span
            data-lodgement-word
            className={`inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-caption ${TONE[read.state]}`}
          >
            {LODGEMENT_WORD[read.state]}
          </span>
        )}
      </div>

      <Body read={read} />

      <Link
        href={`${base}/documents`}
        className="w-fit text-meta text-primary underline underline-offset-4"
      >
        Open documents
      </Link>
    </section>
  );
}

function Body({ read }: { read: LodgementRead }) {
  if (read.state === "unavailable") {
    // Spec §5: omit the failed read with an outage note rather than assert a good
    // state. No word, no band, and nothing that could be mistaken for "clear".
    return (
      <div className="flex flex-col gap-1">
        <p className="max-w-[52ch] text-body text-ink">
          We couldn&apos;t check this case&apos;s document requests.
        </p>
        <p className="max-w-[52ch] text-caption text-ink-soft">
          This is not a statement about this case — please try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {read.state === "blocked" ? (
        <>
          <p className="max-w-[52ch] text-body text-ink">
            Waiting on <span className="font-medium">{read.blocker.title}</span>
            {read.blocker.dueAt === null ? null : (
              <>
                {", due "}
                <time dateTime={read.blocker.dueAt}>{shortDate(read.blocker.dueAt)}</time>
              </>
            )}
            .
          </p>
          {read.otherOutstanding > 0 ? (
            // A count of the OTHERS, never of a total. One named item must not read
            // as the whole of the outstanding work.
            <p className="max-w-[52ch] text-meta text-ink-soft">
              {read.otherOutstanding === 1
                ? "1 other request is also outstanding."
                : `${read.otherOutstanding} other requests are also outstanding.`}
            </p>
          ) : null}
        </>
      ) : (
        <p className="max-w-[52ch] text-body text-ink">{SETTLED_SENTENCE[read.state]}</p>
      )}
      {/* Marked so the honesty scan can exclude it: this is the ONE line where
          "checked or approved" may appear, because there it is a denial, and a
          substring scan cannot tell a claim from its refusal. Its own text is
          pinned separately. */}
      <p data-lodgement-scope className="max-w-[52ch] text-caption text-ink-soft">
        {SCOPE_NOTE}
      </p>
    </div>
  );
}

const SETTLED_SENTENCE: Record<Exclude<LodgementState, "blocked">, string> = {
  clear: "Every document this case has been asked for has arrived.",
  "nothing-requested": "No documents have been requested on this case yet.",
  "none-outstanding": "No document request on this case is outstanding.",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `20 Aug 2026` — hand-rolled in UTC so every environment renders one string
 *  (`case-queue-row.tsx` formats the queue's dates the same way). */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
