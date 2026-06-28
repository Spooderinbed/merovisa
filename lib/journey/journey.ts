// MV-77 (MV-45 #3) — the dashboard "Your journey" panel: a cross-stage "where am I"
// rail. Pure + server-safe, mirroring buildReadiness/ReadinessMap: every stage's
// state comes ONLY from a real signal, and we never claim a completion a signal
// didn't justify. The app replaces the consultancy, whose core value to a confused
// student is "here's the sequence, you're here, next is X" — this gives that, honestly.

import type { EventType } from "@/lib/outcomes/types";

export type JourneyStatus = "done" | "in-progress" | "todo";
export type JourneyKey = "assessed" | "profile" | "matches" | "plan" | "documents" | "apply";

/** The honest, already-derived signals the rail bands from. */
export interface JourneySignals {
  /** A scored primary assessment exists (a completed wizard, not a bare row). */
  hasAssessment: boolean;
  /** Profile completeness, 0–100. */
  profilePct: number;
  /** Programs the student has shortlisted (a user action, never a system claim). */
  shortlistCount: number;
  /** The plan has been worked: any item started OR completed. */
  planEngaged: boolean;
  documentCount: number;
  /** At least one application attempt has been opened. */
  applyAttempted: boolean;
  /** A visa has been granted (or enrolment confirmed). */
  applyGranted: boolean;
}

export interface JourneyStage {
  key: JourneyKey;
  label: string;
  href: string;
  status: JourneyStatus;
  /** Exactly one stage is the "you are here" frontier. */
  current: boolean;
  /** The mono word-label — colour/shape is never the sole carrier of state. */
  word: string;
}

export interface Journey {
  /** Always six stages, fixed order. */
  stages: JourneyStage[];
  /** Honest summary that names each stage's word-state before the visual. */
  ariaLabel: string;
}

const STAGES: ReadonlyArray<{ key: JourneyKey; label: string; href: string }> = [
  { key: "assessed", label: "Assessed", href: "/dashboard" },
  { key: "profile", label: "Profile", href: "/profile" },
  { key: "matches", label: "Matches", href: "/matches" },
  { key: "plan", label: "Plan", href: "/plan" },
  { key: "documents", label: "Documents", href: "/documents" },
  // Apply begins from a matched program; the granular Applied→Offer→Granted detail
  // lives in the per-program funnel rail (MV-73), not here.
  { key: "apply", label: "Apply", href: "/matches" },
];

// The word a stage shows once its true completion signal fires. Plan/Documents are
// absent on purpose: they never read "done" (full readiness is program-scoped).
const DONE_WORD: Partial<Record<JourneyKey, string>> = {
  assessed: "assessed",
  profile: "complete",
  matches: "shortlisted",
  apply: "granted",
};

function statusFor(key: JourneyKey, s: JourneySignals): JourneyStatus {
  switch (key) {
    case "assessed":
      return s.hasAssessment ? "done" : "todo";
    case "profile":
      return s.profilePct >= 100 ? "done" : s.profilePct > 0 ? "in-progress" : "todo";
    case "matches":
      return s.shortlistCount > 0 ? "done" : "todo";
    case "plan":
      return s.planEngaged ? "in-progress" : "todo";
    case "documents":
      return s.documentCount > 0 ? "in-progress" : "todo";
    case "apply":
      return s.applyGranted ? "done" : s.applyAttempted ? "in-progress" : "todo";
  }
}

export function buildJourney(signals: JourneySignals): Journey {
  const computed = STAGES.map((st) => ({ st, status: statusFor(st.key, signals) }));

  // "You are here" = the furthest stage actually reached (status ≠ todo). If that
  // frontier is fully done and a later stage exists, advance the marker to the next
  // actionable stage (so a fresh user, only Assessed done, reads current = Profile).
  // Stages skipped behind the frontier keep their own todo state — honest gaps.
  let reachedIdx = -1;
  computed.forEach((c, i) => {
    if (c.status !== "todo") reachedIdx = i;
  });
  let currentIdx: number;
  if (reachedIdx === -1) currentIdx = 0;
  else if (computed[reachedIdx]?.status === "done" && reachedIdx < STAGES.length - 1) currentIdx = reachedIdx + 1;
  else currentIdx = reachedIdx;

  const stages: JourneyStage[] = computed.map(({ st, status }, i) => {
    const current = i === currentIdx;
    const word =
      status === "done"
        ? DONE_WORD[st.key] ?? "done"
        : status === "in-progress"
          ? "in progress"
          : current
            ? "next"
            : "upcoming";
    return { key: st.key, label: st.label, href: st.href, status, current, word };
  });

  const ariaLabel = "Your journey — " + stages.map((s) => `${s.label}: ${s.word}`).join("; ") + ".";
  return { stages, ariaLabel };
}

/**
 * Fold the dashboard's already-loaded repo data into honest journey signals. Kept
 * pure (and separately tested) so the trust-critical rules live in one place:
 *  - a plan counts as engaged only when an item is started or completed (a freshly
 *    generated, untouched, or only-dismissed plan does not);
 *  - a grant is read from a visa_granted/enrolled event, mirroring buildOutcomeRail.
 */
export function deriveJourneySignals(input: {
  hasAssessment: boolean;
  profilePct: number;
  shortlistCount: number;
  planItems: ReadonlyArray<{ startedAt: string | null; status: string }>;
  documentCount: number;
  attemptCount: number;
  events: ReadonlyArray<EventType>;
}): JourneySignals {
  return {
    hasAssessment: input.hasAssessment,
    profilePct: input.profilePct,
    shortlistCount: input.shortlistCount,
    planEngaged: input.planItems.some((i) => i.startedAt !== null || i.status === "done"),
    documentCount: input.documentCount,
    applyAttempted: input.attemptCount > 0,
    applyGranted: input.events.includes("visa_granted") || input.events.includes("enrolled"),
  };
}
