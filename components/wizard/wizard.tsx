"use client";

import { useEffect, type ComponentType } from "react";
import type { StudentProfile } from "@/lib/scoring/types";
import { evaluateWizardCallouts } from "@/lib/callouts/rules";
import { Button } from "@/components/ui/button";
import { InlineCallout } from "@/components/ui/inline-callout";
import { ProgressDots } from "@/components/ui/progress-dots";
import { useWizardState, type WizardStepKey } from "./use-wizard-state";
import { isStepComplete, STEP_CALLOUT_KEY } from "./step-meta";
import { track } from "@/lib/analytics/events";
import type { StepProps } from "./steps/types";
import { HomeCountryStep } from "./steps/home-country-step";
import { EducationStep } from "./steps/education-step";
import { FieldOfStudyStep } from "./steps/field-of-study-step";
import { GraduationYearStep } from "./steps/graduation-year-step";
import { GapStep } from "./steps/gap-step";
import { EnglishStep } from "./steps/english-step";
import { DestinationStep } from "./steps/destination-step";
import { BudgetStep } from "./steps/budget-step";
import { GoalStep } from "./steps/goal-step";
import { RefusalsStep } from "./steps/refusals-step";

const STEP_COMPONENTS: Record<WizardStepKey, ComponentType<StepProps>> = {
  homeCountry: HomeCountryStep,
  education: EducationStep,
  fieldOfStudy: FieldOfStudyStep,
  graduationYear: GraduationYearStep,
  gap: GapStep,
  english: EnglishStep,
  destination: DestinationStep,
  budget: BudgetStep,
  goal: GoalStep,
  refusals: RefusalsStep,
};

export function Wizard({
  onComplete,
  persist = false,
  fresh = false,
}: {
  onComplete: (profile: StudentProfile) => void;
  persist?: boolean;
  fresh?: boolean;
}) {
  const w = useWizardState(undefined, { persist, fresh });
  useEffect(() => {
    track("wizard_step_viewed", { step: w.stepKey });
  }, [w.stepKey]);
  const calloutKey = STEP_CALLOUT_KEY[w.stepKey];
  const callouts = calloutKey ? evaluateWizardCallouts(w.profile, calloutKey) : [];
  const complete = isStepComplete(w.stepKey, w.profile);
  const StepComponent = STEP_COMPONENTS[w.stepKey];

  const calloutNodes =
    callouts.length > 0 ? (
      <div className="flex flex-col gap-2">
        {callouts.map((c) => (
          <InlineCallout key={c.id} callout={c} />
        ))}
      </div>
    ) : null;

  const handleNext = () => {
    const { done } = w.next();
    if (done) onComplete(w.profile as StudentProfile);
  };

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-narrow flex-col gap-8 px-5 py-10">
      <div className="flex items-center justify-between">
        <ProgressDots total={w.totalSteps} current={w.stepIndex} />
        <span className="font-mono text-small text-ink-faint">{w.stepLabel}</span>
      </div>

      <div
        key={w.stepKey}
        className={`flex-1 ${w.direction === "back" ? "animate-slide-back" : "animate-slide-fwd"}`}
      >
        <StepComponent
          profile={w.profile}
          setField={w.setField}
          callouts={calloutNodes}
          eyebrow={w.stepEyebrow}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="quiet" onClick={w.back} disabled={w.isFirst}>
          ← Back
        </Button>
        <Button onClick={handleNext} disabled={!complete}>
          {w.isLast ? "See where I stand →" : "Continue →"}
        </Button>
      </div>
    </div>
  );
}
