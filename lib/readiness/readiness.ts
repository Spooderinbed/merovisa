// MV-74 — decompose the single banded verdict into an honest dashboard "readiness map".
// The scoring engine already breaks every assessment into per-dimension factors
// (academic/financial/visa), each tagged positive/neutral/risk; this surfaces that
// decomposition as four rows the student can act on. Pure + server-safe: it bands
// from the factor influences alone — it never reads or renders a numeric score, and
// never returns a band a signal didn't justify.

export interface DimensionSignal {
  /** The engine's 0–100 dimension score. Used by the engine, never by this map. */
  value: number;
  factors: Array<{ label: string; influence: "positive" | "neutral" | "risk"; detail?: string | null }>;
}

export interface ReadinessSignals {
  /** null when the user has no primary assessment yet. */
  dimensions: { academic: DimensionSignal; financial: DimensionSignal; visa: DimensionSignal } | null;
  /** 0..100 profile completeness — the header line only, never a row. */
  profilePct: number;
  documentCount: number;
}

export type ReadinessBand =
  | "strong"
  | "needs-work"
  | "risk"
  | "add-detail"
  | "in-progress"
  | "not-started";

export interface ReadinessRow {
  key: "academics" | "money" | "visa" | "documents";
  label: string;
  band: ReadinessBand;
  /** The single most decision-relevant factor (or the honest documents/empty line). */
  why: string | null;
  href: string;
}

export interface Readiness {
  /** Always four rows, fixed order. */
  rows: ReadinessRow[];
  completenessPct: number;
  /** Honest summary that names each band by word — colour is never the sole carrier. */
  ariaLabel: string;
}

const DIMENSION_LABEL: Record<"academics" | "money" | "visa", string> = {
  academics: "Academics & English",
  money: "Money & funding",
  visa: "Visa readiness",
};

const BAND_WORDS: Record<ReadinessBand, string> = {
  strong: "strong",
  "needs-work": "needs work",
  risk: "at risk",
  "add-detail": "add detail",
  "in-progress": "in progress",
  "not-started": "not started",
};

/**
 * Band a scored dimension from its factors alone (the engine's value is never used):
 *   any risk → risk · no factors → add-detail · any neutral → needs-work · else strong.
 * The why-line is the most decision-relevant factor in that same priority order.
 */
function bandDimension(dim: DimensionSignal): { band: ReadinessBand; why: string | null } {
  const first = (inf: DimensionSignal["factors"][number]["influence"]) =>
    dim.factors.find((fac) => fac.influence === inf) ?? null;

  const risk = first("risk");
  if (risk) return { band: "risk", why: risk.label };
  if (dim.factors.length === 0) return { band: "add-detail", why: "Add more detail to assess this" };
  const neutral = first("neutral");
  if (neutral) return { band: "needs-work", why: neutral.label };
  const positive = first("positive");
  return { band: "strong", why: positive ? positive.label : null };
}

export function buildReadiness(signals: ReadinessSignals): Readiness {
  const dims = signals.dimensions;

  const dimensionRow = (key: "academics" | "money" | "visa", dim: DimensionSignal | undefined): ReadinessRow => {
    // No assessment yet: every dimension row is an honest "take the assessment" prompt.
    if (!dim) {
      return { key, label: DIMENSION_LABEL[key], band: "add-detail", why: "Take the assessment to see this", href: "/assess" };
    }
    const { band, why } = bandDimension(dim);
    return { key, label: DIMENSION_LABEL[key], band, why, href: "/profile" };
  };

  const documentsRow: ReadinessRow =
    signals.documentCount > 0
      ? {
          key: "documents",
          label: "Documents",
          band: "in-progress",
          why: `${signals.documentCount} uploaded — keep going`,
          href: "/documents",
        }
      : { key: "documents", label: "Documents", band: "not-started", why: "No documents uploaded yet", href: "/documents" };

  const rows: ReadinessRow[] = [
    dimensionRow("academics", dims?.academic),
    dimensionRow("money", dims?.financial),
    dimensionRow("visa", dims?.visa),
    documentsRow,
  ];

  const ariaLabel =
    "Your readiness — " + rows.map((r) => `${r.label}: ${BAND_WORDS[r.band]}`).join("; ") + ".";

  return { rows, completenessPct: signals.profilePct, ariaLabel };
}
