import type { LodgementRead } from "@/lib/cases/lodgement";
import { SubmittabilityPanel } from "./submittability-panel";

/**
 * The case overview's first region, reserved for the two answers that are the
 * reason a consultancy buys this: the **visa read** and the **lodgement read**
 * (spec §3, "Decision strip").
 *
 * MV-183 fills the second half. The visa read is still absent — its judgement
 * contract is unapproved (spec §0) — and it is absent SILENTLY, for the reason this
 * file was originally written to hold: a "Coming soon" panel in the first region
 * would train a reader to scroll past the region that will matter most, and would
 * advertise a claim nothing behind it can answer. PR 7 adds `visa-risk-panel.tsx`
 * beside the panel below, and does not have to relitigate where the answer goes.
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
}: {
  /** The case route base — `/workspace/{org}/students/{case}`. */
  base: string;
  lodgement?: LodgementRead | null;
}) {
  if (lodgement === undefined || lodgement === null) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <SubmittabilityPanel read={lodgement} base={base} />
    </div>
  );
}
