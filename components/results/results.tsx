"use client";

import { useRef } from "react";
import type { AssessmentPayload } from "@/lib/results/types";
import { VerdictCard } from "./verdict-card";
import { FactorBars } from "./factor-bars";
import { PolicyBanner } from "@/components/matches/policy-banner";
import { CostToApply } from "./cost-to-apply";
import { RefusalRecovery } from "./refusal-recovery";
import { IntakeTimingCard } from "./intake-timing";
import { UniversityMatches } from "./university-matches";
import { GatedTeasers } from "./gated-teasers";
import { AccuracyMeter } from "./accuracy-meter";
import { ConversionPaths } from "./conversion-paths";
import { NextSteps } from "./next-steps";

export function Results({
  payload,
  mode = "anonymous",
  assessmentId = null,
}: {
  payload: AssessmentPayload;
  mode?: "anonymous" | "owned";
  assessmentId?: string | null;
}) {
  const conversionRef = useRef<HTMLDivElement>(null);
  const scrollToConversion = () =>
    conversionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const owned = mode === "owned";

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
      <VerdictCard verdict={payload.result.verdict} />
      <FactorBars dimensions={payload.result.dimensions} />
      {/* Honest corridor context behind the verdict — the same sourced figures
          the matches page shows (grant rate as a cohort range, AL3, DHA floor). */}
      <PolicyBanner />
      {/* Trust-defense: the honest truth about refusal — why applications fail, sector
          odds (HE emphasized, VET as contrast), recovery, and scams. Gov-sourced, not gated. */}
      <RefusalRecovery />
      {/* Sourced out-of-pocket application costs (visa + Nepal-side fees), each
          figure one click from its origin. No engine input — informational. */}
      <CostToApply />
      <IntakeTimingCard intake={payload.intake} />
      <UniversityMatches
        matches={payload.matches}
        total={payload.matchedCount}
        onUnlock={scrollToConversion}
        unlocked={owned}
      />
      <GatedTeasers onUnlock={scrollToConversion} unlocked={owned} />
      <AccuracyMeter accuracy={payload.accuracy} />
      {owned ? (
        <NextSteps />
      ) : (
        <div ref={conversionRef}>
          <ConversionPaths assessmentId={assessmentId} />
        </div>
      )}
    </div>
  );
}
