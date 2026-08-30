import type { LodgementRead } from "@/lib/cases/lodgement";
import type { SubmittabilityRead } from "@/lib/judgement/submittability";
import type { VisaRiskRead } from "@/lib/judgement/visa-risk";
import { EvidencePanel } from "./evidence-panel";
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
 * ## Why there are THREE regions where the spec names two
 *
 * MV-199 adds the evidence read, and it is the spec's "submittability read" in substance:
 * what the program and DHA REQUIRE, with a real denominator. The panel already carrying
 * that filename reads `case_document_requests` — what a counsellor thought to ASK FOR,
 * which has no denominator — and renders under the honest heading "Lodgement".
 *
 * Both are true and neither implies the other: a case can have every requested document
 * in hand and still be missing a requirement nobody thought to request. Collapsing them
 * would have to drop one of those facts, so they sit adjacent instead, ordered by how
 * much of the answer each carries: the visa read, then the requirement rollup, then the
 * chase list.
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
  submittability,
}: {
  /** The case route base — `/workspace/{org}/students/{case}`. */
  base: string;
  lodgement?: LodgementRead | null;
  visaRisk?: VisaRiskRead | null;
  submittability?: SubmittabilityRead | null;
}) {
  // Each read is independently absent. A caller with only one of them gets a strip
  // holding that one, not a half-empty two-column grid with a hole where the other
  // would go — and a caller with none gets nothing, which is still spec §3's rule
  // for a feature that has not shipped.
  const hasLodgement = lodgement !== undefined && lodgement !== null;
  const hasVisaRisk = visaRisk !== undefined && visaRisk !== null;
  const hasSubmittability = submittability !== undefined && submittability !== null;
  if (!hasLodgement && !hasVisaRisk && !hasSubmittability) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {hasVisaRisk ? <VisaRiskPanel read={visaRisk} base={base} /> : null}
      {hasSubmittability ? <EvidencePanel read={submittability} base={base} /> : null}
      {hasLodgement ? <SubmittabilityPanel read={lodgement} base={base} /> : null}
    </div>
  );
}
