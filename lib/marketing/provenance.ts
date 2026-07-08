// lib/marketing/provenance.ts

/** Visual tone shared by verdicts, dimension tags, and fills. */
export type Tone = "strong" | "possible" | "reach";

/** Panel-level verdict word (never "Watch"). */
export type VerdictWord = "Strong" | "Possible" | "Reach";

/** Per-dimension tag (may be "Watch" for an amber-risk dimension). */
export type DimTag = "Strong" | "Possible" | "Watch";

/** Plan-step lifecycle state. */
export type StepState = "Done" | "Now" | "Next" | "Later";

/** Guide exchange identifiers. `gte` is an internal key only; no user copy says GTE. */
export type GuideKey = "ielts" | "funds" | "gte";

/** A real-world claim: always carries its origin and a verified month. */
export interface Sourced {
  kind: "sourced";
  /** e.g. "Home Affairs", "University data". */
  source: string;
  /** e.g. "Jun 2026". */
  verified: string;
}

/** Illustrative demo data: never carries a sourced verification. */
export interface Sample {
  kind: "sample";
}

export function isSourced(x: { kind: string }): x is Sourced {
  return x.kind === "sourced";
}

export function isSample(x: { kind: string }): x is Sample {
  return x.kind === "sample";
}

/**
 * The honesty chokepoint. A sourced claim prints "source · verified <month>";
 * a sample never prints a verified citation (returns null). Every surface that
 * shows a sourced citation renders it through this so the honesty split can
 * never be violated by hand-formatting.
 */
export function verifiedCitation(x: Sourced | Sample): string | null {
  return isSourced(x) ? `${x.source} · verified ${x.verified}` : null;
}
