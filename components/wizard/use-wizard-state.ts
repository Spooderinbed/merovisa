"use client";

import { useCallback, useMemo, useState } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import { computeGapYears, GAP_REQUIRES_REASON_THRESHOLD } from "@/lib/scoring/gap";

export const WIZARD_STEPS = [
  "homeCountry",
  "education",
  "fieldOfStudy",
  "graduationYear",
  "gap",
  "english",
  "destination",
  "budget",
  "goal",
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
};

export interface WizardState {
  profile: Partial<StudentProfile>;
  stepKey: WizardStepKey;
  stepIndex: number;
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  setField: (patch: Partial<StudentProfile>) => void;
  next: () => { done: boolean };
  back: () => void;
}

export function useWizardState(initial: Partial<StudentProfile> = DEFAULT_PROFILE): WizardState {
  const [profile, setProfile] = useState<Partial<StudentProfile>>(initial);
  const [index, setIndex] = useState(0);

  const visible = useMemo(() => visibleStepsFor(profile), [profile]);
  const clampedIndex = Math.min(index, visible.length - 1);
  const stepKey = visible[clampedIndex] ?? "homeCountry";

  const setField = useCallback((patch: Partial<StudentProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const next = useCallback(() => {
    const steps = visibleStepsFor(profile);
    const atEnd = clampedIndex >= steps.length - 1;
    if (!atEnd) setIndex(clampedIndex + 1);
    return { done: atEnd };
  }, [profile, clampedIndex]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  return {
    profile,
    stepKey,
    stepIndex: clampedIndex,
    totalSteps: visible.length,
    isFirst: clampedIndex === 0,
    isLast: clampedIndex === visible.length - 1,
    setField,
    next,
    back,
  };
}
