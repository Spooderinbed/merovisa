import type { StudentProfile } from "@/lib/scoring/types";
import { runAssessment } from "@/lib/scoring/engine";
import { matchUniversities } from "@/lib/matching/universities";
import { applyPreference, anonymousPreferenceAdapter } from "@/lib/matches/preference";
import { computeIntakeTiming } from "@/lib/timing/intake";
import { computeProfileAccuracy } from "./accuracy";
import { AUSTRALIA } from "@/lib/data/destination/australia";
import { CONFIG_RULES_VERIFIED } from "@/lib/data/scoring-config";
import type { AssessmentPayload } from "./types";

// MVP: "not-sure" delegates the corridor choice to us, and NotSureFramingNotice
// tells the user the readout is the Nepal -> Australia standing — so we resolve it
// to Australia *before scoring*. Without this the engine scores it against the
// cheaper not-sure cost band AND skips the Australia DHA financial-capacity gate
// (lib/scoring/financial.ts), inflating an under-funded verdict. Genuinely
// unsupported corridors do NOT fall back here — they are stopped upstream
// (app/api/assess returns 422; UnsupportedDestinationNotice renders).
export function assembleAssessment(profile: StudentProfile, now: Date = new Date()): AssessmentPayload {
  const scored: StudentProfile =
    profile.destination === "not-sure" ? { ...profile, destination: "australia" } : profile;
  const { items: matches, note: preferenceNote } = applyPreference(
    matchUniversities(scored),
    scored.goal,
    anonymousPreferenceAdapter,
    now,
  );
  return {
    result: runAssessment(scored),
    matches,
    matchedCount: matches.length,
    intake: computeIntakeTiming(scored, AUSTRALIA, now),
    accuracy: computeProfileAccuracy(scored),
    rulesVerified: CONFIG_RULES_VERIFIED,
    preferenceNote,
  };
}
