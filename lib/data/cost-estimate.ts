import type { CostLine } from "@/lib/data/cost-to-apply";
import { AU_REPRESENTATIVE_TUITION_AUD, AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { AU_SUBCLASS_500_APPLICATION_CHARGE_AUD } from "@/lib/data/policy/au-visa-fees";
import { AU_OSHC_PREMIUMS } from "@/lib/data/source/au-oshc-premiums";

/**
 * The indicative first-year cost a Nepal → Australia Subclass 500 student plans
 * against, assembled from the sourced fact modules for display — the live answer
 * the matches "Cost estimate" tab replaces its coming-soon copy with.
 *
 * Honesty constraints (same spirit as cost-to-apply):
 *  - One currency only (AUD): every line is an Australia-side cost, so no FX blending.
 *  - OSHC is a *range* across the published provider rate cards (nib → Medibank), not
 *    a single figure — two approved providers quote individually and are never faked.
 *  - Tuition is a representative median of the sourced AU programs, honestly labeled
 *    and deliberately carrying no http source (it is not a single published figure),
 *    so the panel renders it as an estimate rather than a clickable government cite.
 *  - This is application-/study-cost *display* data, not a scoring rule, so it stays
 *    out of the findings ledger and renders client-side.
 */
export interface CostEstimateBreakdown {
  currency: "AUD";
  /** tuition · living · OSHC (range) · visa charge — each with its own source. */
  lines: CostLine[];
  /** Sum of the fixed lines plus the OSHC range floor. */
  totalMin: number;
  /** Sum of the fixed lines plus the OSHC range ceiling. */
  totalMax: number;
  note: string;
}

export function selectCostEstimate(): CostEstimateBreakdown {
  const priced = AU_OSHC_PREMIUMS.filter((p) => p.singleCoverAudPerYear !== null);
  if (priced.length === 0) throw new Error("cost-estimate: no priced OSHC providers");
  const oshcAmounts = priced.map((p) => p.singleCoverAudPerYear as number);
  const oshcLow = Math.min(...oshcAmounts);
  const oshcHigh = Math.max(...oshcAmounts);
  // Anchor the line's source on the cheapest published rate card (its floor figure).
  const oshcAnchor = priced.find((p) => p.singleCoverAudPerYear === oshcLow)!;

  const tuition = AU_REPRESENTATIVE_TUITION_AUD;
  const living = AU_DHA_LIVING_CAPACITY_AUD;
  const visa = AU_SUBCLASS_500_APPLICATION_CHARGE_AUD;

  const oshcMin = Math.round(oshcLow);
  const oshcMax = Math.round(oshcHigh);

  const lines: CostLine[] = [
    {
      label: "Tuition (first year)",
      amount: tuition.value,
      currency: "AUD",
      source: tuition.provenance.source ?? "",
      lastVerified: tuition.provenance.lastVerified,
      note: "representative — median of sourced AU programs; your course may differ",
    },
    {
      label: "Living costs (DHA requirement)",
      amount: living.value,
      currency: "AUD",
      source: living.provenance.source ?? "",
      lastVerified: living.provenance.lastVerified,
      note: `DHA financial-capacity figure, effective ${living.provenance.effectiveDate}`,
    },
    {
      label: "Health cover (OSHC, single)",
      amount: oshcMin,
      amountMax: oshcMax,
      currency: "AUD",
      source: oshcAnchor.source,
      lastVerified: oshcAnchor.lastVerified,
      note: "single cover; varies by provider — ahm & Allianz Care quote individually",
    },
    {
      label: "Student visa charge (DHA)",
      amount: visa.value,
      currency: "AUD",
      source: visa.provenance.source ?? "",
      lastVerified: visa.provenance.lastVerified,
    },
  ];

  const fixed = tuition.value + living.value + visa.value;

  return {
    currency: "AUD",
    lines,
    totalMin: Math.round(fixed + oshcMin),
    totalMax: Math.round(fixed + oshcMax),
    note: 'Indicative first-year estimate for a single student, in AUD. Tuition is a representative median; your course may differ. OSHC is a range across published provider rate cards. Excludes one-off travel and the application costs shown in "what it costs to apply".',
  };
}
