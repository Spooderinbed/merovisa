import Link from "next/link";
import type { NextAction, NextActionKind } from "@/lib/cases/queue";

/**
 * Exactly one thing to do about this case (spec §3, "Next action").
 *
 * The action comes from `resolveNextAction` — the SAME resolver the Day view's
 * queue rows use, so the row a counsellor clicked and the case they landed on
 * cannot disagree about what is outstanding. This component only dresses it.
 *
 * Flat primary tint, never a shadowed feature card, and never a task list: the
 * Plan route owns the backlog. One CTA where the action names a destination, and
 * no CTA where it does not — "Waiting on student" has nowhere to go, and inventing
 * a button for it would be a control that does nothing.
 *
 * ## `uncertain`
 *
 * The resolution reads the assignment (step 2) and the plan (steps 7 and 9). When
 * one of those reads failed AND it could have changed this answer, the caller
 * passes `uncertain` and the panel says so instead of showing a confident,
 * probably-wrong action. The caller decides because only it knows which read
 * failed and whether this viewer's resolution ever reached it — blanking the
 * panel whenever anything is missing would hide actions that are still true.
 */

interface Copy {
  sentence: string;
  cta: { label: string; segment: string } | null;
}

const COPY: Record<Exclude<NextActionKind, "invite" | "add-email">, Copy> = {
  assign: {
    sentence: "Nobody holds this case yet, so nothing moves until somebody does.",
    cta: { label: "Open case details", segment: "manage" },
  },
  review: {
    sentence: "Somebody marked this case ready for review.",
    cta: { label: "Open the profile", segment: "profile" },
  },
  "plan-item": {
    sentence: "The first item on this student's plan that anybody can act on now.",
    cta: { label: "Open the plan", segment: "plan" },
  },
  "plan-underway": {
    sentence: "Every open item on this student's plan is already in progress.",
    cta: { label: "Open the plan", segment: "plan" },
  },
  "waiting-on-student": {
    sentence: "Nothing here is waiting on your side.",
    cta: null,
  },
  open: {
    sentence: "Nothing specific is outstanding on this case right now.",
    cta: null,
  },
  none: {
    sentence: "This case has been closed off, so it is not asking for anything.",
    cta: null,
  },
};

export function CaseNextAction({
  action,
  base,
  uncertain,
}: {
  action: NextAction;
  /** `/workspace/<org>/students/<case>` — every CTA hangs off it. */
  base: string;
  uncertain: boolean;
}) {
  if (uncertain) {
    return (
      <section
        data-testid="case-next-action"
        className="flex flex-col gap-2 rounded-lg border border-line bg-bg-tint p-5"
      >
        <h2 className="text-title font-medium">We couldn&apos;t work out the next action</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Part of this case didn&apos;t load, and the next action depends on it. Something went
          wrong on our side — please try again in a moment.
        </p>
      </section>
    );
  }

  // The two invitation kinds are rendered by `CaseInviteBlock`, which carries
  // spec §3's fuller copy and the linkage explanation this panel has no room for.
  if (action.kind === "invite" || action.kind === "add-email") return null;

  const copy = COPY[action.kind];
  return (
    <section
      data-testid="case-next-action"
      className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary-tint p-5"
    >
      <div className="flex flex-col gap-1">
        <span className="text-caption uppercase tracking-wide text-ink-faint">Next action</span>
        <h2 className="text-title font-medium text-ink">{action.label}</h2>
      </div>
      <p className="max-w-[64ch] text-body text-ink-soft">{copy.sentence}</p>
      {copy.cta !== null ? (
        <div>
          <Link
            href={`${base}/${copy.cta.segment}`}
            className="inline-flex items-center rounded-pill border border-primary px-4 py-2 text-control text-primary transition-colors duration-fast ease-calm hover:bg-bg"
          >
            {copy.cta.label}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
