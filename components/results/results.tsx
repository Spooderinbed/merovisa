"use client";

import { useEffect, useRef } from "react";
import type { AssessmentPayload } from "@/lib/results/types";
import type { Destination } from "@/lib/scoring/types";
import { isDestinationSupported } from "@/lib/scoring/types";
import { track } from "@/lib/analytics/events";
import { UnsupportedDestinationNotice, NotSureFramingNotice } from "./destination-notice";
import { VerdictCard } from "./verdict-card";
import { FactorBars } from "./factor-bars";
import { PolicyBanner } from "@/components/matches/policy-banner";
import { CostToApply } from "./cost-to-apply";
import { RefusalRecovery } from "./refusal-recovery";
import { GenuineStudent } from "./genuine-student";
import { WorkingWithAgents } from "./working-with-agents";
import { IntakeTimingCard } from "./intake-timing";
import { PreferenceNote } from "@/components/matches/preference-note";
import { UniversityMatches } from "./university-matches";
import { GatedTeasers } from "./gated-teasers";
import { AccuracyMeter } from "./accuracy-meter";
import { ConversionPaths } from "./conversion-paths";
import { NextSteps } from "./next-steps";
import { Disclosure } from "@/components/ui/disclosure";

export function Results({
  payload,
  destination,
  mode = "anonymous",
  assessmentId = null,
}: {
  payload: AssessmentPayload;
  destination: Destination;
  mode?: "anonymous" | "owned";
  assessmentId?: string | null;
}) {
  const conversionRef = useRef<HTMLDivElement>(null);
  const scrollToConversion = () =>
    conversionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const owned = mode === "owned";

  // Fires only when a verdict readout actually renders (band only, never the score).
  const supported = isDestinationSupported(destination) || destination === "not-sure";
  const band = payload.result.verdict;
  useEffect(() => {
    if (supported) track("assessment_viewed", { mode, band });
  }, [supported, mode, band]);

  // Destination honesty: an unsupported corridor never silently renders the
  // Australia readout — the user gets a plain "we don't cover this yet".
  if (!isDestinationSupported(destination) && destination !== "not-sure") {
    return (
      <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
        <UnsupportedDestinationNotice destination={destination} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-narrow flex-col gap-6 px-5 py-10">
      {destination === "not-sure" ? <NotSureFramingNotice /> : null}
      <VerdictCard verdict={payload.result.verdict} rulesVerified={payload.rulesVerified} />
      <FactorBars dimensions={payload.result.dimensions} />
      {/* Core path reads first: verdict → factors → timing → matches → cost → next step.
          The heavy government-reference panels follow, folded into a collapsed
          "Know before you go" disclosure so a first-time anonymous student is not met
          by a wall of reference cards. No content is removed — it is all trust-defense. */}
      <IntakeTimingCard intake={payload.intake} />
      <PreferenceNote note={payload.preferenceNote} />
      <UniversityMatches
        matches={payload.matches}
        total={payload.matchedCount}
        onUnlock={scrollToConversion}
        unlocked={owned}
      />
      {/* Sourced out-of-pocket application costs (visa + Nepal-side fees), each
          figure one click from its origin. No engine input — informational. Stays
          top-level: cost-to-apply is part of the core "what's next" path. */}
      <CostToApply />
      <GatedTeasers onUnlock={scrollToConversion} unlocked={owned} />
      <AccuracyMeter accuracy={payload.accuracy} />
      {/* Government reference, collapsed by default. Holds the corridor policy context
          plus the trust-defense triptych — every figure still gov-sourced and linked,
          nothing gated, nothing removed; just tucked behind one accessible toggle. */}
      <Disclosure
        title="Know before you go"
        subtitle="Corridor policy, refusal risk, credibility, and choosing help — straight from government sources."
      >
        {/* Honest corridor context behind the verdict — the same sourced figures
            the matches page shows (grant rate as a cohort range, AL3, DHA floor). */}
        <PolicyBanner />
        {/* Trust-defense: the honest truth about refusal — why applications fail, sector
            odds (HE emphasized, VET as contrast), recovery, and scams. Gov-sourced, not gated. */}
        <RefusalRecovery />
        {/* The Genuine Student test explained — what it is, the four questions, how officers
            weigh it (Direction 106), post-study honesty, and English red flags. Gov-sourced,
            not gated; sits under the refusal panel that names GS as a main ground. */}
        <GenuineStudent />
        {/* Trust-defense triptych closes here: who to trust for help. Gov-sourced (OMARA/DHA +
            the 2026 commission ban), not gated. */}
        <WorkingWithAgents />
      </Disclosure>
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
