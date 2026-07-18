import { Card } from "@/components/ui/card";
import { FIELDS_OF_STUDY_DATA } from "@/lib/data/fields-of-study";

function labelFor(field: string): string {
  return FIELDS_OF_STUDY_DATA.find((f) => f.id === field)?.label ?? field;
}

/**
 * Honest disclosure when the student's intended field has no programs in our catalogue
 * yet (audit C-10). Field is a soft sort, not a hard filter, so off-field programs still
 * surface below — this notice stops them reading as matches in the student's field. It is
 * calm and non-blocking (a coverage gap is knowable, not a dead end), with no fear
 * language. "other" can never have catalogue coverage, so it gets its own reference-only
 * framing. Renders nothing when the field is covered (field null/undefined).
 */
export function FieldCoverageNotice({ field }: { field: string | null | undefined }) {
  if (!field) return null;
  const label = labelFor(field);
  return (
    <Card
      as="aside"
      radius="card"
      tone="tint"
      padding="sm"
      className="flex flex-col gap-1 text-meta text-ink-soft"
    >
      {field === "other" ? (
        <span>
          You chose <strong className="text-ink">Other</strong> as your field, so we can&rsquo;t match by
          field yet. The programs below are shown for reference, not as matches in your field.
        </span>
      ) : (
        <span>
          We don&rsquo;t list <strong className="text-ink">{label}</strong> programs yet, so the matches
          below are from other fields &mdash; not {label}. We&rsquo;re adding fields over time.
        </span>
      )}
    </Card>
  );
}
