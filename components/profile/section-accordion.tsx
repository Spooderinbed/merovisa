import { Disclosure } from "@/components/ui/disclosure";
import type { SectionStatus } from "@/lib/profiles/completeness";

const STATUS_LABEL: Record<SectionStatus, string> = {
  complete: "Complete",
  partial:  "Partial",
  empty:    "Not started",
};

const STATUS_CLS: Record<SectionStatus, string> = {
  complete: "bg-strong-tint text-strong",
  partial:  "bg-possible-tint text-possible",
  empty:    "bg-bg-tint text-ink-faint",
};

/**
 * A profile-group row: the shared `Disclosure` primitive plus the one piece of
 * domain knowledge it doesn't carry — a completeness status pill. Folding onto
 * Disclosure (rather than re-implementing the shell) keeps the chevron, the
 * aria-controls panel wiring, and the calm-authority motion in one place.
 */
export function SectionAccordion({
  title, summary, status, children,
}: {
  title: string; summary: string; status: SectionStatus; children: React.ReactNode;
}) {
  return (
    <Disclosure
      title={title}
      subtitle={summary || "Not added yet"}
      trailing={
        <span className={`inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-caption ${STATUS_CLS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      }
    >
      {children}
    </Disclosure>
  );
}
