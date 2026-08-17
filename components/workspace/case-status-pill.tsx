import { operationalStatusLabel } from "@/lib/cases/operational-status";

/**
 * The operational status as a word pill. Deliberately NOT `VerdictPill`: a case's
 * workflow state is not a judgement about a student, and dressing it in verdict
 * colors would let "Ready for review" read as "Strong". One neutral treatment,
 * words doing the work (spec §4).
 */
export function CaseStatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft">
      {operationalStatusLabel(status)}
    </span>
  );
}
