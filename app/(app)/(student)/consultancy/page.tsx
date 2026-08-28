import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { listLinkedConsultancyCases } from "@/lib/cases/linked-consultancy-cases";
import { STUDENT_CASE_ROUTE_BASE, studentCaseRoutePath } from "@/lib/cases/student-case-route";

/**
 * MV-195 — the student's door to a consultancy case (Stage 5 slice 3).
 *
 * ## Why this page exists at all
 *
 * MV-194 shipped the link and nothing shipped the door. A student who accepted an
 * invitation was linked to a case with **no route to it**: every consultancy case
 * route lives under `/workspace/[organizationId]`, whose layout gates on active
 * `organization_memberships`, and `student` is deliberately not one. So this is a new
 * surface, not a navigation tweak.
 *
 * ## Why it lives in the `(student)` shell and not under `/workspace`
 *
 * Decision A, and `tests/architecture/shell-boundary.test.ts` agrees with it from the
 * other side: the signed-in area has exactly TWO shells and a route directly under
 * `app/(app)/` is stranded with no chrome at all. The consultancy workspace is staff
 * chrome built on the premise that every reader is staff; admitting a student would
 * mean subtracting `case.notes.internal` component by component. **The reuse is the
 * leak.** This is the student's own app, showing them a second case — not the
 * student inside the consultancy's workspace.
 *
 * ## Auto-enter, on the `/workspace` pattern
 *
 * A student with exactly one consultancy case is sent straight into it: a chooser
 * with one item is a control that does nothing. The auto-enter is conditioned on
 * `ok && length === 1`, so a FAILED lookup is never resolved by guessing — and it is
 * not "you have none" either, which is the whole reason this page has an outage
 * state distinct from its empty one.
 *
 * ## What it does not name
 *
 * The consultancy. `organizations_select_member` admits only actual members and a
 * student holds no membership row, so there is no organization name to print;
 * printing the id instead would leak the consultancy's internal naming and tell the
 * student nothing. When a student holds two cases, the date each was opened is the
 * only discriminator they can actually read, and it is what the chooser offers.
 */
export default async function StudentConsultancyIndexPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=${encodeURIComponent(STUDENT_CASE_ROUTE_BASE)}`);

  const result = await listLinkedConsultancyCases(data.user.id, supabase);
  if (result.ok && result.data.length === 1) redirect(studentCaseRoutePath(result.data[0]!.id));

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Your consultancy</span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Cases a consultancy is working on with you</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          These sit beside your own MeroVisa work rather than replacing it. Your answers and your
          documents stay in your account, and your counsellor asks for what they need on their side.
        </p>
      </header>

      {!result.ok ? (
        // "The lookup failed" and "no consultancy is working with you" must never
        // render the same. The second is a claim about the student, and making it
        // falsely is what MV-133 exists to end — here it would land on somebody who
        // created an account for the sole purpose of accepting an invitation.
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">We couldn&apos;t load your consultancy cases</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Something went wrong on our side. This is not a statement about your account — please
            try again in a moment.
          </p>
        </Card>
      ) : result.data.length === 0 ? (
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">
            No consultancy is working on a case with you yet
          </h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            When a consultancy invites you and you accept, their case appears here. Your own
            MeroVisa work is on your{" "}
            <Link href="/dashboard" className="text-primary underline underline-offset-4">
              dashboard
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.data.map((linked) => (
            <li key={linked.id}>
              <Card as="article" padding="lg" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-title font-medium">A consultancy case</h2>
                  {/*
                    The date, and deliberately nothing else. It is the only thing a
                    student can read that tells two cases apart: the consultancy's
                    name is unreadable to them, and the case's display name is a
                    label the consultancy wrote for its own use.
                  */}
                  <p className="text-meta text-ink-soft">Opened {openedOn(linked.openedAt)}</p>
                </div>
                <Link
                  href={studentCaseRoutePath(linked.id)}
                  className="self-start text-control text-primary underline underline-offset-4"
                >
                  Open this case
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A date a person reads, or the raw value when it will not parse. Rendering nothing
 * for an unparseable timestamp would read as "no date", which is a lie about the
 * record rather than an omission — the same rule `operationalStatusLabel` states.
 */
function openedOn(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}
