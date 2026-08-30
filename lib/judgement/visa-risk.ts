import "server-only";
import { scoreVisa } from "@/lib/scoring/visa";
import { scoreFinancial } from "@/lib/scoring/financial";
import { RULE_VERSION } from "@/lib/scoring/engine";
import { CONFIG_VERSION, VERDICT_CUTOFFS } from "@/lib/data/scoring-config";
import type { DimensionScore, RefusalFactorKey, StudentProfile } from "@/lib/scoring/types";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import type { ProfileSections } from "@/lib/profiles/sections";

/**
 * The per-case visa-risk read (MV-198) — the first slice of the judgement layer,
 * and the capability `docs/research/2026-08-11-program-data-wedge.md` §6 ranks #1
 * of seven: the only one with live third-party demand and no incumbent.
 *
 * Spec: `docs/superpowers/specs/2026-08-29-judgement-layer.md` (what it answers),
 * and `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` §3
 * ("Visa-risk read") for the five rows, the band, and the abstention states.
 *
 * ## This is an EXTRACTION, not a merge
 *
 * Criterion 1's measurement (`tests/scoring/visa-risk-read-measurement.test.ts`)
 * found four of the research's six refusal factors already modelled — but not in
 * one place, and not cleanly. `scoreFinancial` emits the DHA capacity test (a
 * genuine refusal factor, carrying the government figure's provenance) *beside*
 * "Budget within typical range", which is an affordability signal and not a
 * refusal signal at all. Folding the financial dimension in wholesale would file
 * an affordability observation under a refusal heading.
 *
 * So this module takes only what is tagged `refusalFactor` (see
 * `lib/scoring/types.ts`) and leaves the rest of both dimensions behind. The tag is
 * why selection is structural rather than a match on factor prose, which would
 * break silently the first time the copy was edited.
 *
 * ## Why it does not use the engine's verdict
 *
 * `runAssessment` returns one overall verdict that folds academic standing and
 * profile strength in with visa. That verdict answers "will a university say yes";
 * this read answers "will the visa hold", and they are different questions with
 * different answers. Nothing here reads `AssessmentResult`.
 *
 * ## No number escapes
 *
 * `scoreVisa` and `scoreFinancial` both return a raw 0–100 `value`. Banding
 * consumes those and nothing re-exports them: `VisaRiskRead` carries no field of
 * type `number` anywhere, which is asserted structurally rather than by scanning
 * for digits (money figures survive inside the engine's authored sentences, and
 * they are evidence, not a score).
 */

export const VISA_RISK_BANDS = ["strong", "possible", "reach"] as const;
export type VisaRiskBand = (typeof VISA_RISK_BANDS)[number];

/**
 * The five rows spec §3 names, in the order it names them. `source-of-funds` has no
 * `RefusalFactorKey` counterpart on purpose: the engine does not model it, and the
 * row exists to say so rather than to be quietly dropped.
 */
export const VISA_RISK_FACTOR_KEYS = [
  "financial-capacity",
  "source-of-funds",
  "english-floor",
  "gap-justification",
  "prior-refusal",
] as const;
export type VisaRiskFactorKey = (typeof VISA_RISK_FACTOR_KEYS)[number];

/**
 * `not-modelled` is the fourth state and the load-bearing one: it is neither a pass
 * nor a fail, and a surface that collapsed it into either would be claiming an
 * answer nobody computed.
 */
export type VisaRiskFactorState = "positive" | "neutral" | "risk" | "not-modelled";

export interface VisaRiskFactor {
  key: VisaRiskFactorKey;
  /** The row heading. Sentence case, and stable across states. */
  label: string;
  state: VisaRiskFactorState;
  /** One sentence. Taken verbatim from the engine's factor where one exists. */
  sentence: string;
  /** Present only where the engine's factor cited a real source. */
  source?: { url: string; lastVerified?: string };
}

export type VisaRiskRead =
  /** The read failed. Say so; never render a good state for an outage. */
  | { state: "unavailable" }
  /** Spec §3: an unlinked case gets no verdict, because there is no student behind it. */
  | { state: "no-linked-student" }
  /** Linked, but nothing recorded to judge. An empty profile is not a bad profile. */
  | { state: "insufficient-data" }
  | {
      state: "read";
      band: VisaRiskBand;
      conclusion: string;
      /** The single item to fix first, and always one of `factors` — never a separate claim. */
      blocker: VisaRiskFactor | null;
      factors: readonly VisaRiskFactor[];
      /** Factors the research names that this read does not hold. Criterion 6. */
      notHeld: readonly string[];
      ruleVersion: string;
      configVersion: string;
    };

const ROW_LABEL: Record<VisaRiskFactorKey, string> = {
  "financial-capacity": "Financial capacity",
  "source-of-funds": "Source-of-funds credibility",
  "english-floor": "English visa floor",
  "gap-justification": "Gap justification",
  "prior-refusal": "Prior refusals",
};

/**
 * What each row says when the engine emitted nothing for it. These are statements
 * about the RECORD, not about the student: "no refusal is recorded" is true and
 * checkable, where "no prior refusal" would be a claim about the world that a
 * profile with an unanswered immigration section cannot support.
 */
const ABSENT_ROW: Record<RefusalFactorKey, { state: VisaRiskFactorState; sentence: string }> = {
  "financial-capacity": {
    state: "not-modelled",
    sentence:
      "Not assessed. The financial-capacity test is modelled against the Australian requirement, and this case is not set to Australia.",
  },
  "english-floor": {
    state: "neutral",
    sentence: "No English result is recorded on this profile yet.",
  },
  "gap-justification": {
    state: "neutral",
    sentence: "No study gap is recorded on this profile.",
  },
  "prior-refusal": {
    state: "neutral",
    sentence: "No prior visa refusal is recorded on this profile.",
  },
};

/**
 * Source-of-funds credibility, stated once. Research factor 2 of 6, and absent from
 * the engine — measured, not assumed.
 *
 * The trap this row exists to close: `fundingSource` IS populated on the profile, so
 * a reader glancing at the data would think the factor is covered. It is not.
 * "Education loan" is a *declared funding type*; DHA weighs the *credibility of the
 * source*, and a declaration is not credibility. The evidence that would settle it —
 * bank records, sponsor letters, loan sanction — lives in the case's documents, which
 * is where MV-199 picks it up. Keep that seam narrow.
 */
const SOURCE_OF_FUNDS_ROW: VisaRiskFactor = {
  key: "source-of-funds",
  label: ROW_LABEL["source-of-funds"],
  state: "not-modelled",
  sentence:
    "Not assessed. The profile records a declared funding type, which is not evidence that the money is genuine and available; that evidence sits in the case's documents.",
};

/**
 * Criterion 6 — the omitted factor, named on the surface. The research counts "the
 * evidence gap named" as part of the capability, so a read that quietly omitted this
 * would fail the card even with every other row correct.
 */
const NOT_HELD: readonly string[] = [
  "Provider risk level is not held. The provider's assessment level is not something this read has, so nothing here accounts for it.",
];

/** Which risk to name first when several fire. Money refuses a Subclass 500 most often. */
const BLOCKER_PRIORITY: readonly VisaRiskFactorKey[] = [
  "financial-capacity",
  "prior-refusal",
  "english-floor",
  "gap-justification",
];

/**
 * `verdict.ts`'s own floor semantics, applied to this read's two inputs rather than
 * to four dimensions: a dimension under the floor forces Reach, and Strong needs
 * every dimension at or above `strongMinDimension`.
 *
 * Reusing `VERDICT_CUTOFFS` is deliberate — it is sourced, versioned and already
 * governs the caps `scoreFinancial` applies at the DHA gate (49 blocks Strong, 29
 * forces Reach, both landing just under these thresholds). Inventing a second set of
 * cut-points here would let the gate and the band disagree about what "below the DHA
 * requirement" costs.
 */
function bandFor(minDimension: number): VisaRiskBand {
  if (minDimension < VERDICT_CUTOFFS.minDimensionFloor) return "reach";
  if (minDimension >= VERDICT_CUTOFFS.strongMinDimension) return "strong";
  return "possible";
}

function rowFor(
  key: RefusalFactorKey,
  emitted: DimensionScore["factors"],
): VisaRiskFactor {
  const found = emitted.find((f) => f.refusalFactor === key);
  if (!found) {
    return { key, label: ROW_LABEL[key], state: ABSENT_ROW[key].state, sentence: ABSENT_ROW[key].sentence };
  }
  return {
    key,
    label: ROW_LABEL[key],
    state: found.influence,
    sentence: found.detail,
    // Spread rather than assign, so an unsourced factor carries no `source` key at
    // all: criterion 5's "absent where it does not exist" is a structural absence,
    // not an undefined the surface has to remember to check.
    ...(found.source ? { source: found.source } : {}),
  };
}

function conclusionFor(band: VisaRiskBand, blocker: VisaRiskFactor | null): string {
  if (blocker === null) {
    return "Nothing this read models points to a refusal on this case.";
  }
  const item = blocker.label.toLowerCase();
  if (band === "strong") {
    // The band can clear while a factor still reads risk — see the prior-refusal
    // absorption pinned in `tests/judgement/visa-risk.test.ts`. The conclusion must
    // not round that away into "nothing to worry about".
    return `This case reads well overall, but ${item} still works against it.`;
  }
  if (band === "possible") {
    return `This case is arguable. ${blocker.label} is the item to fix first.`;
  }
  return `This case reads as a refusal risk. ${blocker.label} is the item to fix first.`;
}

/**
 * Compose one case's visa-risk read.
 *
 * Pure and synchronous — no I/O, no database, no clock. The reading is
 * `readCaseVisaRisk` in `lib/cases/case-frame.ts`, which owns the two absences this
 * function cannot see: a failed query (`unavailable`) and a case whose profile has
 * no sections at all (`profile: null` → `insufficient-data`).
 */
/**
 * One case's visa read from its stored profile sections — the whole judgement a caller
 * can make once a `profiles` row is in hand, absences included.
 *
 * Extracted for MV-200. The caseload rollup reads `profiles` for a whole page in one
 * batched query rather than one case at a time, so without this it would have had to
 * restate the emptiness rule below — and a second copy of that rule is exactly the
 * "parallel re-derivation" the card forbids. `readCaseVisaRisk` and the batched
 * caseload read now reach the same answer through the same function; only the I/O
 * differs.
 *
 * The trap this rule closes is worth restating where it lives:
 * `sectionsToStudentProfile({})` does not fail. It returns a fully-shaped profile of
 * DEFAULTS — grade 0, budget 0, no English test — which the engine scores as a poor
 * case. Handing that to a surface would tell a counsellor that a case nobody has
 * filled in yet is a refusal risk, so the emptiness is caught before the engine sees
 * it.
 */
export function visaRiskFromSections(input: {
  hasLinkedStudent: boolean;
  sections: ProfileSections | null;
}): VisaRiskRead {
  if (!input.hasLinkedStudent) return { state: "no-linked-student" };
  if (input.sections === null || Object.keys(input.sections).length === 0) {
    return { state: "insufficient-data" };
  }
  return deriveVisaRisk({
    hasLinkedStudent: true,
    profile: sectionsToStudentProfile(input.sections),
  });
}

export function deriveVisaRisk(input: {
  hasLinkedStudent: boolean;
  profile: StudentProfile | null;
}): VisaRiskRead {
  // Spec §3, "Unlinked case". Checked BEFORE the profile, because a consultancy can
  // fill a case's profile itself and the resulting read would be a verdict on data
  // no student has stood behind.
  if (!input.hasLinkedStudent) return { state: "no-linked-student" };
  if (input.profile === null) return { state: "insufficient-data" };

  const visa = scoreVisa(input.profile);
  const financial = scoreFinancial(input.profile);
  const emitted = [...visa.factors, ...financial.factors];

  const factors: VisaRiskFactor[] = VISA_RISK_FACTOR_KEYS.map((key) =>
    key === "source-of-funds" ? SOURCE_OF_FUNDS_ROW : rowFor(key, emitted),
  );

  const capacity = factors.find((f) => f.key === "financial-capacity");
  // The financial dimension only pulls the band down when the DHA capacity gate
  // actually fired. Letting `financial.value` in unconditionally would reintroduce
  // budget-vs-course-cost through the back door — the affordability signal this
  // module exists to keep out of a refusal read.
  const minDimension =
    capacity?.state === "risk" ? Math.min(visa.value, financial.value) : visa.value;
  const band = bandFor(minDimension);

  const blocker =
    BLOCKER_PRIORITY.map((key) => factors.find((f) => f.key === key && f.state === "risk")).find(
      (f): f is VisaRiskFactor => f !== undefined,
    ) ?? null;

  return {
    state: "read",
    band,
    conclusion: conclusionFor(band, blocker),
    blocker,
    factors,
    notHeld: NOT_HELD,
    ruleVersion: RULE_VERSION,
    configVersion: CONFIG_VERSION,
  };
}
