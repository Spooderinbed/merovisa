import { describe, it, expect, vi } from "vitest";

// The read model is `server-only` (scoring rules must never reach client JS).
// This is the established repo idiom for testing such a module.
vi.mock("server-only", () => ({}));

import {
  deriveVisaRisk,
  VISA_RISK_FACTOR_KEYS,
  type VisaRiskRead,
} from "@/lib/judgement/visa-risk";
import type { StudentProfile } from "@/lib/scoring/types";
import { CONFIG_PROVENANCE } from "@/lib/data/scoring-config";

/**
 * MV-198 criteria 2, 4, 5, 6 and 7 — the case-scoped visa-risk read model.
 *
 * Criterion 1's probe (`tests/scoring/visa-risk-read-measurement.test.ts`) measured
 * what exists; this file specifies what the composition must do with it. The three
 * findings that measurement produced are each pinned here as a test, because each
 * one is a way this slice could quietly go wrong:
 *
 *   1. the composition is an EXTRACTION, not a merge — budget-vs-course-cost is an
 *      affordability signal and must not appear under a refusal heading;
 *   2. `fundingSource` is a declared TYPE, not source-of-funds credibility, so that
 *      factor is `not-modelled` and may never render as a pass;
 *   3. the engine's overall verdict is admissions-shaped, so this read does not use
 *      it and must not be derivable from it.
 */

const currentYear = new Date().getFullYear();

/** Nepal → Australia, the only corridor the MVP covers. Same shape as the probe's. */
const baseProfile: StudentProfile = {
  homeCountry: "Nepal",
  educationLevel: "bachelors",
  gradeSystem: "percentage-nepal",
  grade: 72,
  fieldOfStudy: "computer-science",
  graduationYear: currentYear,
  gapReasons: [],
  englishStatus: "taken",
  englishScore: 7.0,
  destination: "australia",
  budget: 4_500_000,
  budgetCurrency: "NPR",
  fundingSource: "education-loan",
  goal: "permanent-residency",
};

/** A case that has everything going for it: funded well past the DHA floor, strong English. */
const fundedProfile: StudentProfile = { ...baseProfile, budget: 15_000_000 };

/**
 * Funded, but a 3-year gap spent working — the commonest real Nepali applicant shape,
 * and the one where judgement actually bites. `fundedProfile` is deliberately NOT used
 * for the band-movement tests below: see "what the band absorbs" at the foot of this
 * file for the measurement that forced the distinction.
 */
const borderlineProfile: StudentProfile = {
  ...fundedProfile,
  graduationYear: currentYear - 3,
  gapReasons: ["worked"],
};

function read(profile: StudentProfile | null, hasLinkedStudent = true): VisaRiskRead {
  return deriveVisaRisk({ hasLinkedStudent, profile });
}

/** Narrow to the state that carries an answer, failing loudly rather than casting. */
function judged(r: VisaRiskRead) {
  if (r.state !== "read") throw new Error(`expected a judged read, got "${r.state}"`);
  return r;
}

const factor = (r: VisaRiskRead, key: (typeof VISA_RISK_FACTOR_KEYS)[number]) => {
  const found = judged(r).factors.find((f) => f.key === key);
  if (!found) throw new Error(`no factor for "${key}"`);
  return found;
};

/** Reach is worst, strong is best — for asserting that an input MOVED the answer. */
const BAND_ORDER = { reach: 0, possible: 1, strong: 2 } as const;

describe("MV-198 — the read abstains rather than guessing", () => {
  it("an unlinked case gets no band at all", () => {
    // Spec §3 "Unlinked case": the honest state is "Not available — no linked
    // student profile", never a verdict computed from consultancy-entered data.
    expect(read(fundedProfile, false)).toEqual({ state: "no-linked-student" });
  });

  it("a linked case with no profile is insufficient data, not a Reach", () => {
    // The trap this closes: an empty profile scores badly on every dimension, so a
    // read that just ran the engine would call an untouched case a refusal risk.
    expect(read(null)).toEqual({ state: "insufficient-data" });
  });
});

describe("MV-198 criterion 2 — the composition is an extraction, not a merge", () => {
  it("names exactly the spec's five factor rows, in the spec's order", () => {
    // Spec §3: "Five sentence rows: financial capacity, source-of-funds
    // credibility, English visa floor versus course threshold, gap justification,
    // and prior refusals."
    expect(judged(read(baseProfile)).factors.map((f) => f.key)).toEqual([
      "financial-capacity",
      "source-of-funds",
      "english-floor",
      "gap-justification",
      "prior-refusal",
    ]);
  });

  it("takes the DHA capacity test from the financial dimension", () => {
    // Proven by provenance rather than prose: only the DHA capacity factor carries
    // `AU_DHA_LIVING_CAPACITY_AUD`'s government source, so a row carrying it can only
    // have come from that test. (The "well below" branch's own sentence says "the
    // student visa expects" and never repeats "DHA" — matching on the copy would
    // have pinned the wording rather than the wiring.)
    const thin = factor(read({ ...baseProfile, budget: 500_000 }), "financial-capacity");
    expect(thin.state).toBe("risk");
    expect(thin.source?.url).toBe(CONFIG_PROVENANCE.AU_DHA_LIVING_CAPACITY_AUD?.source);
    expect(thin.sentence).toContain("the student visa expects");
  });

  it("leaves budget-vs-course-cost behind — it is affordability, not refusal", () => {
    // Finding 1. `scoreFinancial` emits "Budget below/above/within typical range"
    // alongside the DHA test; folding the whole dimension in would file an
    // affordability signal under a refusal heading.
    const all = judged(read(fundedProfile))
      .factors.map((f) => f.sentence)
      .join(" ")
      .toLowerCase();
    expect(all).not.toContain("typical range");
  });

  it("leaves the funding-source label behind too, and says why", () => {
    // Finding 2. "Education loan" is a declared funding TYPE. DHA weighs the
    // CREDIBILITY of the source, and a declaration is not credibility — so this row
    // is `not-modelled` even though `fundingSource` is populated on the profile.
    const funds = factor(read({ ...baseProfile, fundingSource: "education-loan" }), "source-of-funds");
    expect(funds.state).toBe("not-modelled");
    expect(funds.sentence.toLowerCase()).not.toContain("education loan");
  });

  it("never reports source-of-funds as a pass, however good the rest of the case is", () => {
    // The failure mode this guards: a later author sees four green rows and lets the
    // fifth default to green with them.
    for (const profile of [baseProfile, fundedProfile, { ...baseProfile, budget: 500_000 }]) {
      expect(factor(read(profile), "source-of-funds").state).toBe("not-modelled");
    }
  });

  it("does not carry the engine's admissions verdict", () => {
    // Finding 3. `runAssessment` folds academic and profile-strength in with visa;
    // its verdict answers "will a university say yes", which is a different question.
    const r = judged(read(baseProfile));
    expect(r).not.toHaveProperty("verdict");
    expect(r).not.toHaveProperty("weighted");
    expect(r).not.toHaveProperty("dimensions");
  });
});

describe("MV-198 criterion 7 — not scoring-inert: every input moves the output", () => {
  it("money moves the band", () => {
    // The single most important assertion in the file. Without the extraction, a
    // student with strong English and no gaps but no money reads Strong — which is
    // exactly backwards for a visa, and is the defect the card exists to fix.
    const funded = BAND_ORDER[judged(read(fundedProfile)).band];
    const broke = BAND_ORDER[judged(read({ ...baseProfile, budget: 300_000 })).band];
    expect(broke).toBeLessThan(funded);
  });

  it("English moves the row, and moves the band on a case near the line", () => {
    const passing = factor(read(borderlineProfile), "english-floor");
    const failing = factor(read({ ...borderlineProfile, englishScore: 4.0 }), "english-floor");
    expect(passing.state).toBe("positive");
    expect(failing.state).toBe("risk");

    const withEnglish = BAND_ORDER[judged(read(borderlineProfile)).band];
    const without = BAND_ORDER[judged(read({ ...borderlineProfile, englishScore: 4.0 })).band];
    expect(without).toBeLessThan(withEnglish);
  });

  it("a prior refusal moves the band, and a second one moves it again", () => {
    const clean = BAND_ORDER[judged(read(borderlineProfile)).band];
    const one = BAND_ORDER[judged(read({ ...borderlineProfile, priorRefusals: "one" })).band];
    const many = BAND_ORDER[judged(read({ ...borderlineProfile, priorRefusals: "multiple" })).band];
    expect(one).toBeLessThanOrEqual(clean);
    expect(many).toBeLessThanOrEqual(one);
    expect(many).toBeLessThan(clean);
  });

  it("an explained gap reads better than an unexplained one", () => {
    const unexplained = factor(
      read({ ...fundedProfile, graduationYear: currentYear - 4, gapReasons: [] }),
      "gap-justification",
    );
    const worked = factor(
      read({ ...fundedProfile, graduationYear: currentYear - 4, gapReasons: ["worked"] }),
      "gap-justification",
    );
    expect(unexplained.state).toBe("risk");
    expect(worked.state).not.toBe("risk");
  });

  it("every one of the four modelled factors can reach `risk` on some profile", () => {
    // A factor that renders but can never fire is decoration. Source-of-funds is
    // excluded by construction — it is `not-modelled`, which is the honest state.
    const worst: StudentProfile = {
      ...baseProfile,
      budget: 300_000,
      englishScore: 4.0,
      graduationYear: currentYear - 6,
      gapReasons: [],
      priorRefusals: "multiple",
    };
    const risky = judged(read(worst))
      .factors.filter((f) => f.state === "risk")
      .map((f) => f.key);
    expect(risky).toEqual([
      "financial-capacity",
      "english-floor",
      "gap-justification",
      "prior-refusal",
    ]);
  });
});

describe("MV-198 criterion 4 — banded, never numeric", () => {
  /** Every value reachable in the read, flattened. */
  function walk(node: unknown, path: string, out: Array<[string, unknown]>): void {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    } else if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, out);
    } else {
      out.push([path, node]);
    }
  }

  const profiles: StudentProfile[] = [
    baseProfile,
    fundedProfile,
    { ...baseProfile, budget: 300_000, englishScore: 4.0, priorRefusals: "multiple" },
    { ...baseProfile, englishStatus: "not-taken", englishScore: undefined },
  ];

  it("the read contains no numbers at all — the 0–100 dimension value never escapes", () => {
    // The structural version of "no score reaches the surface". `scoreVisa` returns
    // a raw 0–100 `value`; banding consumes it and nothing re-exports it. Money
    // figures survive INSIDE authored sentences (they are evidence, not a score),
    // which is why the ban is on the value TYPE rather than on digits.
    const offenders: string[] = [];
    for (const profile of profiles) {
      const leaves: Array<[string, unknown]> = [];
      walk(read(profile), "read", leaves);
      for (const [path, value] of leaves) {
        if (typeof value === "number") offenders.push(`${path} = ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no percentage or probability reaches the read", () => {
    for (const profile of profiles) {
      const serialized = JSON.stringify(read(profile));
      expect(serialized).not.toContain("%");
      expect(serialized).not.toMatch(/\bpercent/i);
      expect(serialized).not.toMatch(/\bprobabilit/i);
      expect(serialized).not.toMatch(/\d\s*\/\s*100\b/);
    }
  });

  it("the band is one of three words", () => {
    for (const profile of profiles) {
      expect(["strong", "possible", "reach"]).toContain(judged(read(profile)).band);
    }
  });
});

describe("MV-198 criterion 5 — provenance where it exists, and only there", () => {
  it("the DHA capacity factor carries its government source", () => {
    const capacity = factor(read(fundedProfile), "financial-capacity");
    expect(capacity.source?.url).toBeTruthy();
    expect(capacity.source?.lastVerified).toBeTruthy();
  });

  it("the heuristic factors assert no sourced threshold", () => {
    // Baseline measured by criterion 1: the gap and prior-refusal factors are
    // internal heuristics and carry no `source`. Rendering an unsourced factor with
    // a citation would be the trust defect this criterion names.
    expect(factor(read(baseProfile), "gap-justification").source).toBeUndefined();
    expect(factor(read({ ...baseProfile, priorRefusals: "one" }), "prior-refusal").source)
      .toBeUndefined();
  });

  it("the read is stamped with the rule and config versions behind it", () => {
    const r = judged(read(baseProfile));
    expect(r.ruleVersion).toMatch(/^v\d/);
    expect(r.configVersion).toMatch(/^config-v\d/);
  });
});

describe("MV-198 criterion 6 — the omitted factor is named", () => {
  it("provider risk level is stated as not held", () => {
    // Research factor 6 of 6, and the one that is data-blocked. "The evidence gap
    // named" is part of the capability as the research defines it, so omitting it
    // silently fails the card.
    const stated = judged(read(baseProfile)).notHeld.join(" ").toLowerCase();
    expect(stated).toContain("provider risk");
  });

  it("names it on every judged read, not only on a bad one", () => {
    for (const profile of [baseProfile, fundedProfile]) {
      expect(judged(read(profile)).notHeld.length).toBeGreaterThan(0);
    }
  });
});

describe("MV-198 — the single blocking item", () => {
  it("is the worst risk factor when one exists", () => {
    const r = judged(read({ ...fundedProfile, priorRefusals: "multiple" }));
    expect(r.blocker?.key).toBe("prior-refusal");
  });

  it("prefers money over a softer risk, because money is what refuses a 500", () => {
    const r = judged(
      read({ ...baseProfile, budget: 300_000, graduationYear: currentYear - 4, gapReasons: [] }),
    );
    expect(r.blocker?.key).toBe("financial-capacity");
  });

  it("is null when nothing is a risk", () => {
    expect(judged(read(fundedProfile)).blocker).toBeNull();
  });

  it("is always one of the rendered factors, never a separate claim", () => {
    const r = judged(read({ ...baseProfile, budget: 300_000 }));
    expect(r.factors).toContain(r.blocker);
  });
});

describe("MV-198 — what the band absorbs (measured, not designed)", () => {
  /**
   * A finding, pinned so it cannot be lost, and NOT a fix.
   *
   * `scoreVisa` starts at 80 and pays a +8 recent-graduate bonus and up to +5 for
   * above-threshold English. On a funded, no-gap, IELTS-7 case that is 93 points of
   * headroom, which is enough to absorb the entire prior-refusal penalty (-35) and
   * still clear `strongMinDimension` (50) at 58.
   *
   * So on that one profile shape, MULTIPLE PRIOR VISA REFUSALS DO NOT MOVE THE BAND.
   * The research names prior refusal as one of the six factors that decide a
   * refusal, and `visa.ts` itself calls it "one of the strongest real-world DHA
   * Subclass 500 risk factors" — which sits badly beside a penalty its own baseline
   * can swallow.
   *
   * Two reasons this slice does not change it: the penalty is a versioned scoring
   * rule with its own provenance note, and re-weighting it moves every existing
   * student verdict as well as this new read. It is a founder decision, carried on
   * the card. What this slice owes is that the surface never hides it — and it does
   * not: the prior-refusal ROW reads `risk` in both cases below, so a counsellor
   * sees the refusal even where the band does not.
   */
  it("absorbs multiple prior refusals on a funded no-gap case — the row still says risk", () => {
    const clean = judged(read(fundedProfile));
    const refused = judged(read({ ...fundedProfile, priorRefusals: "multiple" }));

    expect(refused.band).toBe(clean.band);
    expect(factor(read({ ...fundedProfile, priorRefusals: "multiple" }), "prior-refusal").state)
      .toBe("risk");
    // And the blocker still surfaces it, so the case is not silently clean.
    expect(refused.blocker?.key).toBe("prior-refusal");
  });
});
