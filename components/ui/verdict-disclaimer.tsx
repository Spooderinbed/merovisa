/**
 * The not-immigration-advice boundary shown near every verdict and on the
 * results / matches / plan surfaces. The copy is deliberately honest about the
 * cold-start limit (MV-08 not built yet): verdicts are rules-based estimates,
 * never a guaranteed outcome. Copy is the MV-05 tightened, Codex-approved boundary
 * (names the real decision-makers + routes case-specific questions to an OMARA
 * agent/lawyer). The /privacy + /terms pages it points to are a separate MV-05
 * sub-slice (pending founder D3); this component is the placement mechanism.
 */
import { Card } from "@/components/ui/card";

export const NOT_ADVICE_DISCLAIMER =
  "This is a rules-based estimate, not immigration advice. Your result comes from published rules and can change — it is not a guarantee of any visa or admission outcome. The relevant decision-makers decide your case under the rules that apply at the time — the Department of Home Affairs for your visa, and each institution for its own admission. For advice on your own application, see a registered migration agent (OMARA) or a lawyer.";

export function VerdictDisclaimer({
  message = NOT_ADVICE_DISCLAIMER,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <Card
      as="p"
      role="note"
      radius="card"
      className={`px-3 py-2 text-small text-ink-soft ${className}`.trim()}
    >
      {message}
    </Card>
  );
}
