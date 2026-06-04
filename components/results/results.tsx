"use client";

import { useRef } from "react";
import type { AssessmentPayload } from "@/lib/results/types";
import { VerdictCard } from "./verdict-card";
import { FactorBars } from "./factor-bars";
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
