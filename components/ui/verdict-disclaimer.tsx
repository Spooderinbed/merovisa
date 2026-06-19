/**
 * The not-immigration-advice boundary shown near every verdict and on the
 * results / matches / plan surfaces. The copy is deliberately honest about the
 * cold-start limit (MV-08 not built yet): verdicts are rules-based estimates,
 * never a guaranteed outcome. The exact legal wording / retention policy is a
 * founder + lawyer decision tracked on MV-05 — this component is the placement
 * mechanism, not a substitute for that text.
 */
export const NOT_ADVICE_DISCLAIMER =
  "This is a rules-based estimate, not immigration advice. Verdicts come from published rules and can change — they are not a guarantee of any visa or admission outcome.";

export function VerdictDisclaimer({
  message = NOT_ADVICE_DISCLAIMER,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <p
      role="note"
      className={`rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-soft ${className}`.trim()}
    >
      {message}
    </p>
  );
}
