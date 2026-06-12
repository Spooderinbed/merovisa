import { AU_SUBCLASS_500_APPLICATION_CHARGE_AUD } from "@/lib/data/policy/au-visa-fees";
import { NEPAL_APPLICATION_FEES } from "@/lib/data/source/nepal-application-fees";
import { AU_PROVIDER_APPLICATION_FEES } from "@/lib/data/source/au-provider-application-fees";

/**
 * "What it costs to apply" — the out-of-pocket application costs a Nepal → Australia
 * Subclass 500 applicant pays, assembled from the sourced fact modules for display.
 *
 * Two honesty constraints shape the shape:
 *  - Costs are grouped by the currency they're actually paid in (NPR in Nepal, AUD
 *    to Australia) and never blended into one figure — converting would require an
 *    FX rate, which is a volatile heuristic we deliberately don't pretend to source.
 *  - The Nepal side is curated to the common application path (one IELTS sitting,
 *    one passport, regular equivalence) rather than dumping every variant, so the
 *    subtotal reflects a real journey instead of an inflated worst case.
 * Every line keeps its own source + verified date, so each figure is one click from
 * its origin.
 */
export interface CostLine {
  label: string;
  amount: number;
  /** Upper bound when the cost is a range (e.g. provider fees 0–150). */
  amountMax?: number;
  currency: "AUD" | "NPR";
  source: string;
  lastVerified?: string;
  /** Short qualifier shown after the label, e.g. "sometimes waived". */
  note?: string;
}

export interface CostGroup {
  heading: string;
  currency: "AUD" | "NPR";
  lines: CostLine[];
  /** Sum of the group's fixed line items, where a meaningful subtotal exists. */
  subtotal?: number;
}

export interface CostToApplyBreakdown {
  groups: CostGroup[];
  note: string;
}

/** The common Nepal-side application path (one option per step, not every variant). */
const NEPAL_CORE_IDS = [
  "ielts-academic-computer",
  "vfs-biometric",
  "panel-medical-exam",
  "passport-34-page",
  "tu-equivalence-regular",
] as const;

/** Shorter, scannable labels for the panel (the data labels are documentary). */
const NEPAL_LINE_LABEL: Record<string, string> = {
  "ielts-academic-computer": "IELTS test (computer-delivered)",
  "vfs-biometric": "VFS biometrics",
  "panel-medical-exam": "Panel medical exam",
  "passport-34-page": "Passport (34-page)",
  "tu-equivalence-regular": "Academic equivalence (TU)",
};

export function selectCostToApply(): CostToApplyBreakdown {
  const nepalLines: CostLine[] = NEPAL_CORE_IDS.map((id) => {
    const fee = NEPAL_APPLICATION_FEES.find((f) => f.id === id);
    if (!fee) throw new Error(`cost-to-apply: missing Nepal fee "${id}"`);
    return {
      label: NEPAL_LINE_LABEL[id] ?? fee.label,
      amount: fee.amountNpr,
      currency: "NPR",
      source: fee.source,
      lastVerified: fee.lastVerified,
    };
  });
  const nepalSubtotal = nepalLines.reduce((total, line) => total + line.amount, 0);

  const visa = AU_SUBCLASS_500_APPLICATION_CHARGE_AUD;

  // Provider application fees vary (0–150) and are sometimes waived; surface the range
  // and anchor its upper bound on the dearest provider's page rather than pretend
  // a single figure applies everywhere.
  const providerAmounts = AU_PROVIDER_APPLICATION_FEES.map((p) => p.amountAud);
  const providerMin = Math.min(...providerAmounts);
  const providerMax = Math.max(...providerAmounts);
  const dearestProvider = AU_PROVIDER_APPLICATION_FEES.find((p) => p.amountAud === providerMax);
  if (!dearestProvider) throw new Error("cost-to-apply: no provider application fees");

  const australiaLines: CostLine[] = [
    {
      label: "Student visa charge (DHA)",
      amount: visa.value,
      currency: "AUD",
      source: visa.provenance.source ?? "",
      lastVerified: visa.provenance.lastVerified,
    },
    {
      label: "University application fee",
      amount: providerMin,
      amountMax: providerMax,
      currency: "AUD",
      source: dearestProvider.source,
      lastVerified: dearestProvider.lastVerified,
      note: "varies by university; sometimes waived",
    },
  ];

  return {
    groups: [
      { heading: "Paid in Nepal", currency: "NPR", lines: nepalLines, subtotal: nepalSubtotal },
      { heading: "Paid to Australia", currency: "AUD", lines: australiaLines },
    ],
    note: "Application costs only — separate from tuition and living costs. Shown in each cost's original currency; we don't blend exchange rates.",
  };
}
