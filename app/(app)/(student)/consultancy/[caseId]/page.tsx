import Link from "next/link";
import { Card } from "@/components/ui/card";
import { openStudentCaseRoute } from "@/lib/cases/student-case-route";
import { listCaseDocumentRequests } from "@/lib/cases/document-requests-repo";
import {
  listCaseDocumentReviews,
  listCaseDocumentVersions,
} from "@/lib/cases/document-collaboration-repo";
import {
  deriveRequestProgress,
  REQUEST_PROGRESS_SENTENCE,
  REQUEST_PROGRESS_TONE,
  REQUEST_PROGRESS_WORD,
} from "@/lib/cases/document-collaboration";
import { DOCUMENT_META } from "@/lib/documents/types";

/**
 * MV-195 — one consultancy case, as its STUDENT sees it (Stage 5 slice 3).
 *
 * ## What this page is
 *
 * The answer to a sentence Stage 4 wrote down and did not build. `lib/cases/permissions.ts`,
 * on the student's `case.documents.request: "deny"`:
 *
 * > "Reading what has been asked of them is `case.read`, which this role holds at `linked` —
 * > so this `deny` withholds the ask, never the answer. The student-facing surface that shows
 * > it is Stage 5 and is not built by MV-182."
 *
 * MV-182 shipped document requests against a case with no way for the invited student to see
 * one. This is that surface: **what your consultancy has asked you for, and what has happened
 * to each item.**
 *
 * ## Read-only, and that was MEASURED rather than chosen (decision D)
 *
 * The three collaboration tables split cleanly down the middle:
 *
 * - `case_document_requests_select_actor`, `case_document_versions_select_actor` and
 *   `case_document_reviews_select_actor` all ride `private.actor_case_ids()`, whose first
 *   disjunct is `student_user_id = auth.uid()`. **The linked student may READ all three** —
 *   MV-185's own comment says the reviews policy exists so they see "a rejection note, which
 *   is the half of this model that is any use to them".
 * - Every INSERT policy on those tables, and the requests UPDATE policy, ride
 *   `private.can_staff_case`, which is `can_access_case` MINUS the student disjunct. **The
 *   student may write nothing**, and MV-182/MV-185 both name that subtraction as the point.
 *
 * So answering a request — uploading a version — needs a new policy and a new column grant,
 * which is a MIGRATION, which the card makes a separate slice. This page therefore offers no
 * write control at all, and says plainly how to send a document instead. A control that
 * appeared and then failed would be worse than an absent one: it would tell the student they
 * were allowed (`canResolveByHand`'s reasoning, one reader over).
 *
 * ## What it does not read, and therefore cannot leak
 *
 * The CASE ROW. `display_name` is a label the consultancy wrote for its own filing,
 * `operational_status` is its internal pipeline vocabulary ("Ready for review" is a staff
 * judgement about the case, not a fact for its subject), and the assigned counsellor is the
 * consultancy's roster. None of it is read here, so none of it can reach the markup —
 * `case.notes.internal: "deny"` proved structurally rather than by omission.
 *
 * ## Three reads, and a failure in any of them is an outage
 *
 * `case_document_requests.status` is `outstanding | resolved` and collapses five human
 * states into two, so the versions and the reviews are what the display state is derived
 * from. An empty version list read as "nothing has arrived" — when the truth is "we could not
 * find out" — would tell a student their consultancy is still waiting on a file that is
 * already sitting in the counsellor's review queue.
 */
export default async function StudentConsultancyCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  const gate = await openStudentCaseRoute(caseId);
  if (!gate.ok) return <Outage heading="We couldn't check your access" />;

  const [requests, versions, reviews] = await Promise.all([
    listCaseDocumentRequests(caseId, gate.supabase),
    listCaseDocumentVersions(caseId, gate.supabase),
    listCaseDocumentReviews(caseId, gate.supabase),
  ]);
  if (!requests.ok) {
    return <Outage heading="We couldn't load what your consultancy has asked for" />;
  }
  if (!versions.ok || !reviews.ok) {
    return <Outage heading="We couldn't load the documents on this case" />;
  }

  const items = requests.data.map((request) => ({
    request,
    // A kind with no entry renders as ITSELF. The check constraint bounds the column
    // today, but a widened vocabulary would ship rows this build has no label for,
    // and a silently blank line reads as a request for nothing.
    kindLabel: DOCUMENT_META.find((meta) => meta.kind === request.kind)?.label ?? request.kind,
    progress: deriveRequestProgress(request, versions.data, reviews.data),
  }));

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">
          Your consultancy
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">What your consultancy has asked you for</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          Your counsellor works this case with you. Everything on it is theirs to update — this
          page is where you can see what they still need and what they have already accepted.
        </p>
      </header>

      <section aria-labelledby="asked-of-you" className="flex flex-col gap-3">
        <h2 id="asked-of-you" className="text-title font-medium">
          Documents
        </h2>

        {items.length === 0 ? (
          <Card as="p" padding="lg" className="max-w-[64ch] text-body text-ink-soft">
            Your consultancy hasn&apos;t asked you for anything yet. When they do, each item will
            appear here with what has happened to it.
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map(({ request, kindLabel, progress }) => (
              <li key={request.id}>
                <Card as="article" padding="lg" className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-control font-medium">{request.title}</h3>
                    {/* The WORD is always the carrier; the tint only agrees with it. */}
                    <span
                      className={`rounded-pill px-3 py-1 text-meta ${REQUEST_PROGRESS_TONE[progress.state]}`}
                    >
                      {REQUEST_PROGRESS_WORD[progress.state]}
                    </span>
                  </div>
                  {/*
                    The vault's own word for the kind, and ONLY when it adds one. A
                    counsellor asking for a passport usually leaves the title as the
                    label, so printing both would show the same sentence twice — which
                    reads as two requirements rather than one.
                  */}
                  {kindLabel === request.title ? null : (
                    <p className="text-meta text-ink-faint">{kindLabel}</p>
                  )}
                  {/*
                    The counsellor's instruction TO the student. `case.documents.request`
                    withholds the ASKING, never the ask itself — reading it rides
                    `case.read`, which this role holds at `linked`.
                  */}
                  {request.note ? (
                    <p className="max-w-[64ch] text-body text-ink-soft">{request.note}</p>
                  ) : null}
                  <p className="max-w-[64ch] text-body text-ink-soft">
                    {REQUEST_PROGRESS_SENTENCE[progress.state]}
                  </p>
                  {/*
                    The rejection note, and the reason MV-185 stores one at all: "rejected"
                    with no words is a wall, and this is where it stops being one. Shown for
                    a rejection only — an acceptance rarely needs words, and a stray note on
                    an accepted file would read as a reservation nobody expressed.
                  */}
                  {progress.state === "rejected" && progress.newestReview?.note ? (
                    <p className="max-w-[64ch] text-body text-reach">
                      {progress.newestReview.note}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}

        {/*
          Decision D, said out loud rather than implied by an absent button. A student
          holds no INSERT on any of the three collaboration tables — every one of those
          policies rides `private.can_staff_case` — so there is no upload here to offer,
          and pretending otherwise would fail at the database after the student had done
          the work.
        */}
        <p className="max-w-[64ch] text-caption text-ink-soft">
          You can&apos;t upload a file here yet. Send documents to your counsellor the way you
          normally reach them, and this page will show it once they add it to the case.
        </p>
      </section>

      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">Your own MeroVisa work is separate</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          This case belongs to your consultancy. Your own answers, matches, plan and documents
          stay in your account and are not visible here — nothing has been taken away from you,
          and nothing has been copied across.
        </p>
        <Link
          href="/dashboard"
          className="self-start text-control text-primary underline underline-offset-4"
        >
          Go to your own MeroVisa work
        </Link>
      </Card>
    </div>
  );
}

/**
 * The outage state. A page rather than a card: unlike the consultancy case route there
 * is no persistent frame above this that has already passed a gate and named anything,
 * so there is nothing for a card to sit inside.
 */
function Outage({ heading }: { heading: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">{heading}</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about your case or your
          access — please try again in a moment.
        </p>
      </Card>
    </div>
  );
}
