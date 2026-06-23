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
  isFirst: boolean;
  isLast: boolean;
  setField: (patch: Partial<StudentProfile>) => void;
  next: () => { done: boolean };
  back: () => void;
}

export function useWizardState(
  initial: Partial<StudentProfile> = DEFAULT_PROFILE,
  options: { persist?: boolean } = {},
): WizardState {
  const persist = options.persist ?? false;
  // Rehydrate once at mount from sessionStorage when persistence is on.
  const restored = persist ? readPersistedWizard() : null;
  const [profile, setProfile] = useState<Partial<StudentProfile>>(restored?.profile ?? initial);
  const [index, setIndex] = useState(restored?.index ?? 0);

  useEffect(() => {
    if (!persist) return;
    writePersistedWizard({ profile, index });
  }, [persist, profile, index]);

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
