"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import { computeGapYears, GAP_REQUIRES_REASON_THRESHOLD } from "@/lib/scoring/gap";

// In-progress anonymous wizard answers + position, so a refresh / back-nav /
// tab-restore within the browser session does not wipe the 9 steps (MV-28 a).
export const WIZARD_STORAGE_KEY = "myvisa.wizard.v1";

interface PersistedWizard {
  profile: Partial<StudentProfile>;
  index: number;
}

function readPersistedWizard(): PersistedWizard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWizard;
    if (!parsed || typeof parsed.index !== "number" || typeof parsed.profile !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedWizard(value: PersistedWizard): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / quota — degrade to in-memory only.
  }
}

export const WIZARD_STEPS = [
  "homeCountry",
  // Destination sits second so the full corridor (Nepal → destination) — and
  // therefore whether we cover it — is settled before the six effort screens.
  // A student bound for an unsupported corridor learns it up front rather than
  // after answering education/grades/English (MV-47, audit #23).
  "destination",
  "education",
  "fieldOfStudy",
  "graduationYear",
  "gap",
  "english",
  "budget",
  "goal",
  // Asked last, immediately before results: a prior-refusal answer materially changes
  // the verdict (a real DHA Subclass 500 risk factor), so the anonymous verdict must
  // reflect it up front instead of silently dropping a band later, when a signed-in
  // student volunteers it in the profile editor (F-1). No default — explicit choice.
  "refusals",
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number];

export function visibleStepsFor(profile: Partial<StudentProfile>): WizardStepKey[] {
  const hasGap =
    profile.graduationYear !== undefined &&
    computeGapYears(profile.graduationYear) > GAP_REQUIRES_REASON_THRESHOLD;
  return WIZARD_STEPS.filter((s) => (s === "gap" ? hasGap : true));
}

const DEFAULT_PROFILE: Partial<StudentProfile> = {
  homeCountry: "Nepal",
  gradeSystem: "percentage-nepal",
  budgetCurrency: "NPR",
  // Always present so a no-gap profile (gap step skipped) still satisfies
  // ProfileSchema, which requires gapReasons to be an array. The gap step
  // populates it when a meaningful gap exists.
  gapReasons: [],
};

export interface WizardState {
  profile: Partial<StudentProfile>;
  stepKey: WizardStepKey;
  stepIndex: number;
  totalSteps: number;
  /** Single source of truth for the on-screen counter, e.g. "Step 6 of 8". */
  stepLabel: string;
  /**
   * The current step's eyebrow, e.g. "Step 6" — the same number as stepLabel so
   * a step's eyebrow can never drift from the live counter (the conditional gap
   * step used to push later eyebrows one ahead). Steps render this, never a
   * hardcoded "Step N".
   */
  stepEyebrow: string;
  isFirst: boolean;
  isLast: boolean;
  /** Navigation direction for the step slide transition: "fwd" on next, "back" on back. */
  direction: "fwd" | "back";
  setField: (patch: Partial<StudentProfile>) => void;
  next: () => { done: boolean };
  back: () => void;
}

export function useWizardState(
  initial: Partial<StudentProfile> = DEFAULT_PROFILE,
  options: { persist?: boolean; fresh?: boolean } = {},
): WizardState {
  const persist = options.persist ?? false;
  const fresh = options.fresh ?? false;
  // SSR-stable seeds: never read sessionStorage during render, or the server
  // ("Step 1") and the first client render (restored step) would diverge and
  // React would report a hydration mismatch (MV-118 #7). Restore runs in the
  // mount effect below instead.
  const [profile, setProfile] = useState<Partial<StudentProfile>>(initial);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  // Gate the persist WRITE on restore having run, so the mount-time default write
  // can't clobber persisted answers before the restore effect below reads them.
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate from sessionStorage after mount (never during render). `fresh`
  // (/assess?new=1) deterministically SKIPS restore: React runs this child effect
  // before AssessFlow's parent clear effect, so relying on the clear would
  // resurrect stale answers for one commit (MV-28 fresh contract, MV-118 #7).
  /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only restore of
     persisted answers; SSR + the first client render already emitted the stable step-1
     seeds, so this post-commit seed is intended, not a render loop (MV-118 #7). */
  useEffect(() => {
    if (!persist || fresh) {
      setHydrated(true);
      return;
    }
    const restored = readPersistedWizard();
    if (restored) {
      setProfile(restored.profile);
      setIndex(restored.index);
    }
    setHydrated(true);
  }, [persist, fresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!persist || !hydrated) return;
    writePersistedWizard({ profile, index });
  }, [persist, hydrated, profile, index]);

  const visible = useMemo(() => visibleStepsFor(profile), [profile]);
  const clampedIndex = Math.min(index, visible.length - 1);
  const stepKey = visible[clampedIndex] ?? "homeCountry";
  // One number feeds both the counter and the eyebrow, so they cannot disagree.
  const stepNumber = clampedIndex + 1;

  const setField = useCallback((patch: Partial<StudentProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const next = useCallback(() => {
    setDirection("fwd");
    const steps = visibleStepsFor(profile);
    const atEnd = clampedIndex >= steps.length - 1;
    if (!atEnd) setIndex(clampedIndex + 1);
    return { done: atEnd };
  }, [profile, clampedIndex]);

  const back = useCallback(() => {
    setDirection("back");
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  return {
    profile,
    stepKey,
    stepIndex: clampedIndex,
    totalSteps: visible.length,
    stepLabel: `Step ${stepNumber} of ${visible.length}`,
    stepEyebrow: `Step ${stepNumber}`,
    isFirst: clampedIndex === 0,
    isLast: clampedIndex === visible.length - 1,
    direction,
    setField,
    next,
    back,
  };
}
