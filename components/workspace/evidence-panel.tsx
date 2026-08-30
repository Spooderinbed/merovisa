import Link from "next/link";
import type {
  StageSubmittability,
  SubmittabilityRead,
  SubmittabilityRow,
} from "@/lib/judgement/submittability";

/**
 * The evidence-completeness read (MV-199) — the third region of the decision strip, and
 * capability #2 of the 2026-08-11 wedge research: *"which of my students is actually
 * submittable, and what single item is blocking each"*.
 *
 * ## Why it is not called the submittability panel
 *
 * `submittability-panel.tsx` is taken. MV-183 built it against
 * `case_document_requests` — what a counsellor thought to ASK FOR — and it renders under
 * the heading "Lodgement", which is the honest name for what that source knows. This
 * panel reads what the program and DHA REQUIRE, which is a different question with a
 * different denominator, and the two must not stand in for each other. Adjacent regions,
 * separate names.
 *
 * ## The count spec §3 banned, and why this one is allowed
 *
 * Spec §3: *"No completion percentage unless Stage 4 establishes a truthful
 * denominator."* Stage 4 never did, and `submittability-panel.tsx` correctly renders no
 * total to this day. The ban is on claiming a total nobody knows — and the checklist
 * generator does know one: `requirement: "required"` per program, with the uncompletable
 * reference rows excluded by `computeReadiness` itself.
 *
 * So there is a count, and it is honest in the one way that matters: **it names what it
 * is a total for.** A denominator is program-conditional, so the panel says which
 * program produced it. There is still no percentage, no bar and no score — a fraction of
 * a named set is a fact, and a percentage of it is a summary that invites comparison
 * between cases whose sets differ.
 *
 * ## No single word for the whole panel, deliberately
 *
 * Both neighbours lead with one word in a tinted pill. This one cannot, and the reason
 * is criterion 7: apply-stage and lodge-stage are different answers, and a case that is
 * ready to apply is routinely nowhere near ready to lodge. Any single word would BE the
 * collapse — so the two stages get one line each, and the panel leads with nothing.
 *
 * ## One blocker, and the stage it blocks
 *
 * The ranking rule lives in `lib/judgement/submittability.ts` and is argued there. What
 * the surface adds is the stage label: "chase the IELTS scorecard" and "chase the CoE"
 * are different instructions, and the second is impossible before an offer exists.
 */

export function EvidencePanel({ read, base }: { read: SubmittabilityRead; base: string }) {
  return (
    <section
      aria-label="Evidence"
      className="flex flex-col gap-3 rounded-lg border border-line p-5"
    >
      <h2 className="text-caption uppercase tracking-wide text-ink-faint">Evidence</h2>

      <Body read={read} base={base} />
    </section>
  );
}

function Body({ read, base }: { read: SubmittabilityRead; base: string }) {
  if (read.state === "no-program") {
    return (
      <Note
        headline="No program is shortlisted on this case."
        detail="What a case needs depends on the program, so there is nothing to measure against yet."
      />
    );
  }

  if (read.state === "programs-differ") {
    return (
      <Note
        headline={`The ${read.programCount} programs on this case need different evidence.`}
        detail="Open the checklist for the one this student is applying with — a single answer here would have to guess which."
      />
    );
  }

  if (read.state === "unavailable") {
    // Spec §5, and the lodgement panel's rule: a failed read must SAY it failed.
    // Rendering nothing would read as "this case has nothing outstanding".
    return (
      <Note
        headline="We couldn't check this case's requirements."
        detail="This is not a statement about this case — please try again in a moment."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-1.5">
        <Stage testId="evidence-apply" label="Apply stage" stage={read.apply} />
        <Stage testId="evidence-lodge" label="Lodge stage" stage={read.lodge} />
      </dl>

      {read.blocker === null ? (
        <p className="max-w-[52ch] text-body text-ink">
          Every requirement on this program&apos;s list has arrived.
        </p>
      ) : (
        <Blocker row={read.blocker} stage={read.apply.complete ? "lodge" : "apply"} />
      )}

      <p data-testid="evidence-basis" className="max-w-[52ch] text-caption text-ink-soft">
        Measured against {read.program.name}
        {read.alsoCovers > 0
          ? `, and ${read.alsoCovers} other shortlisted ${read.alsoCovers === 1 ? "program that needs" : "programs that need"} the same evidence`
          : ""}
        .
      </p>

      <Link
        href={`${base}/checklist/${read.program.id}`}
        className="w-fit text-meta text-primary underline underline-offset-4"
      >
        Open checklist
      </Link>
    </div>
  );
}

/**
 * One stage's count. `ready of total`, never a percentage — and the word "ready" rather
 * than "done", because a self-reported row counts here and "done" would overclaim.
 */
function Stage({
  testId,
  label,
  stage,
}: {
  testId: string;
  label: string;
  stage: StageSubmittability;
}) {
  return (
    <div data-testid={testId} className="flex flex-wrap items-baseline gap-2">
      <dt className="text-control font-medium text-ink">{label}</dt>
      <dd className="text-control text-ink-soft">
        {stage.ready} of {stage.total} ready
      </dd>
    </div>
  );
}

function Blocker({ row, stage }: { row: SubmittabilityRow; stage: "apply" | "lodge" }) {
  return (
    <div data-testid="evidence-blocker" className="flex flex-col gap-0.5">
      <p className="max-w-[52ch] text-body text-ink">
        {stage === "apply" ? "Blocking the application" : "Blocking lodgement"}:{" "}
        <span className="font-medium">{row.label}</span>.
      </p>
      {row.source ? (
        <a
          href={row.source.url}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-caption text-primary underline underline-offset-4"
        >
          {row.source.lastVerified ? `Source, verified ${row.source.lastVerified}` : "Source"}
        </a>
      ) : null}
    </div>
  );
}

function Note({ headline, detail }: { headline: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="max-w-[52ch] text-body text-ink">{headline}</p>
      <p className="max-w-[52ch] text-caption text-ink-soft">{detail}</p>
    </div>
  );
}
