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

export function Results({ payload }: { payload: AssessmentPayload }) {
  const conversionRef = useRef<HTMLDivElement>(null);
  const scrollToConversion = () =>
    conversionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
      <VerdictCard verdict={payload.result.verdict} />
      <FactorBars dimensions={payload.result.dimensions} />
      <IntakeTimingCard intake={payload.intake} />
      <UniversityMatches matches={payload.matches} total={payload.matchedCount} onUnlock={scrollToConversion} />
      <GatedTeasers onUnlock={scrollToConversion} />
      <AccuracyMeter accuracy={payload.accuracy} />
      <div ref={conversionRef}>
        <ConversionPaths />
      </div>
    </div>
  );
}
