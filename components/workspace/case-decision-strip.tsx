import type { LodgementRead } from "@/lib/cases/lodgement";
import type { VisaRiskRead } from "@/lib/judgement/visa-risk";
import { SubmittabilityPanel } from "./submittability-panel";
import { VisaRiskPanel } from "./visa-risk-panel";

/**
 * The case overview's first region, reserved for the two answers that are the
 * reason a consultancy buys this: the **visa read** and the **lodgement read**
 * (spec §3, "Decision strip").
 *
 * MV-183 filled the second half; MV-198 fills the first. The visa read is spec §3's
 * differentiating answer and now sits where this file always said it would, without
 * having had to relitigate where the answer goes.
 *
 * Order matters and is the spec's: "Decision strip: visa-risk read and submittability
 * read." The visa read leads because it answers the question the consultancy cannot
 * answer anywhere else; lodgement answers what is left to collect.
 *
 * ## Absent and failed are different, and the strip treats them differently
 *
 * `lodgement` omitted or `null` — the caller has no read to give — renders NOTHING,
 * which is spec §3's rule for a feature that has not shipped.
 *
 * `lodgement: { state: "unavailable" }` — the caller HAS a read and it FAILED —
 * renders the panel's outage note. Spec §5 is explicit that a failed enrichment must
 * not silently show a good state; silently showing nothing at all would be the same
 * mistake wearing a quieter coat, because the reader would conclude the case has no
 * lodgement concerns rather than that we could not find out.
 */
export function CaseDecisionStrip({
  base,
  lodgement,
  visaRisk,
}: {
  /** The case route base — `/workspace/{org}/students/{case}`. */
  base: string;
  lodgement?: LodgementRead | null;
  visaRisk?: VisaRiskRead | null;
}) {
  // Each read is independently absent. A caller with only one of them gets a strip
  // holding that one, not a half-empty two-column grid with a hole where the other
  // would go — and a caller with neither gets nothing, which is still spec §3's rule
  // for a feature that has not shipped.
  const hasLodgement = lodgement !== undefined && lodgement !== null;
  const hasVisaRisk = visaRisk !== undefined && visaRisk !== null;
  if (!hasLodgement && !hasVisaRisk) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {hasVisaRisk ? <VisaRiskPanel read={visaRisk} base={base} /> : null}
      {hasLodgement ? <SubmittabilityPanel read={lodgement} base={base} /> : null}
    </div>
  );
}
