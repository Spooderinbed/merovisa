import type { StudentProfile } from "@/lib/scoring/types";
import type { Program, University } from "@/lib/programs/types";
import { runAssessment } from "@/lib/scoring/engine";
import { computeMatches } from "@/lib/matches/compute";
import { profileToMatchInputs } from "@/lib/matches/from-student-profile";
import { applyPreference, signedInPreferenceAdapter } from "@/lib/matches/preference";
import { attachNepalEvidence } from "@/lib/matches/evidence";
import { computeIntakeTiming } from "@/lib/timing/intake";
import { competitivenessNote } from "@/lib/scoring/field-note";
import { computeProfileAccuracy } from "./accuracy";
import { AUSTRALIA } from "@/lib/data/destination/australia";
import { CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";
import { scoringRulesStale } from "@/lib/data/scoring-freshness";
import type { AssessmentPayload } from "./types";

// MVP: "not-sure" delegates the corridor choice to us, and NotSureFramingNotice
// tells the user the readout is the Nepal -> Australia standing — so we resolve it
// to Australia *before scoring*. Without this the engine scores it against the
// cheaper not-sure cost band AND skips the Australia DHA financial-capacity gate
// (lib/scoring/financial.ts), inflating an under-funded verdict. Genuinely
// unsupported corridors do NOT fall back here — they are stopped upstream
// (app/api/assess returns 422; UnsupportedDestinationNotice renders).
// The catalogue (programs + universities) is dependency-injected rather than
// fetched here so this stays a pure function: the anonymous path now reads the SAME
// DB catalogue the signed-in path does (callers pass lib/programs/repo results),
// while the test suite passes fixtures. This is what makes an anonymous student's
// match set equal the one they get after signing in.
export function assembleAssessment(
  profile: StudentProfile,
  programs: Program[],
  universities: University[],
  now: Date = new Date(),
): AssessmentPayload {
  const scored: StudentProfile =
    profile.destination === "not-sure" ? { ...profile, destination: "australia" } : profile;
  const { items: ranked, note: preferenceNote } = applyPreference(
    computeMatches(profileToMatchInputs(scored), programs, universities),
    scored.goal,
    signedInPreferenceAdapter,
    now,
  );
  // Surface each provider's DHA Nepal evidence level on the match (server-side, so
  // the harvested directory/evidence datasets never reach the client bundle).
  const matches = attachNepalEvidence(ranked);
  return {
    result: runAssessment(scored),
    matches,
    matchedCount: matches.length,
    intake: computeIntakeTiming(scored, AUSTRALIA, now),
    accuracy: computeProfileAccuracy(scored),
    rulesVerified: CONFIG_RULES_VERIFIED,
    rulesStale: scoringRulesStale(now),
    preferenceNote,
    // Honest context for any "also considering" field whose admission bar differs
    // materially from the primary — carried on the payload like preferenceNote, so the
    // results page can show it near the verdict. The verdict itself stays scored on the
    // primary field alone (competitivenessNote never touches the score).
    competitivenessNote: competitivenessNote(scored.fieldOfStudy, scored.alsoConsidering),
  };
}
