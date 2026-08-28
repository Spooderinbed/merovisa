import Link from "next/link";
import { Card } from "@/components/ui/card";
import { STUDENT_CASE_ROUTE_BASE } from "@/lib/cases/student-case-route";

/**
 * MV-195 — the named affordance that takes a student to their consultancy case
 * (Stage 5 slice 3, decision B).
 *
 * ## Why an affordance and not a redirect
 *
 * The personal case stays what `/dashboard` shows. A student's own case is the one
 * they built and the only one holding their own answers; silently landing them
 * somewhere else — especially somewhere near-empty — would read as data loss, which
 * is the exact misreading the founder decision of 2026-08-24 obliges this slice to
 * prevent. So the second case is offered, never imposed.
 *
 * ## Why it is shown when the lookup FAILED as well as when it succeeded
 *
 * Hiding it on a failed probe would hide the only route to a case the student may
 * well have — and for the reader this slice is most about (criterion 8: somebody who
 * created an account solely to accept an invitation) the dashboard is otherwise
 * empty, so a hidden door is a dead end. `/consultancy` owns the outage sentence,
 * because it is the page making the claim; this card only says a door exists.
 *
 * It renders NOTHING when the student is known to have no consultancy case. An
 * always-present "Your consultancy" panel would be a standing invitation to a
 * surface that has nothing to show.
 */
export function ConsultancyDoor({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <Card as="section" padding="md" className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-control font-medium">A consultancy is working with you</h2>
        {/*
          States the separation positively. The student's own work is not "still"
          here as though it survived something — it simply is here, and the
          consultancy's case is a second, separate thing.
        */}
        <p className="max-w-[64ch] text-meta text-ink-soft">
          Their case is separate from the work on this page. Open it to see what they have asked
          you for.
        </p>
      </div>
      <Link
        href={STUDENT_CASE_ROUTE_BASE}
        className="shrink-0 rounded-pill bg-primary px-[15px] py-2 text-meta font-medium text-on-primary hover:bg-primary-ink"
      >
        Your consultancy
      </Link>
    </Card>
  );
}
