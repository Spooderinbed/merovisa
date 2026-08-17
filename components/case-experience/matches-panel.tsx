import type * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getProfileForCase } from "@/lib/profiles/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { listShortlistForCase } from "@/lib/matches/repo";
import { computeMatches } from "@/lib/matches/compute";
import { hasSufficientInputs } from "@/lib/matches/sufficiency";
import { uncoveredField } from "@/lib/matches/coverage";
import { applyPreference, signedInPreferenceAdapter } from "@/lib/matches/preference";
import { sectionsToMatchInputs } from "@/lib/matches/from-sections";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { MatchesTabs } from "@/components/matches/matches-tabs";
import { VerdictGroup } from "@/components/matches/verdict-group";
import type { Status } from "@/components/matches/shortlist-button";
import { PolicyBanner } from "@/components/matches/policy-banner";
import { VerdictDisclaimer } from "@/components/ui/verdict-disclaimer";
import { CostToApply } from "@/components/results/cost-to-apply";
import { CostEstimatePanel } from "@/components/matches/cost-estimate-panel";
import { ScholarshipsPanel } from "@/components/matches/scholarships-panel";
import { PreferenceNote } from "@/components/matches/preference-note";
import { GoalTradeoffNote } from "@/components/matches/goal-tradeoff-note";
import { FieldCoverageNotice } from "@/components/results/field-coverage-notice";
import { goalTradeoffNote } from "@/lib/goals/conflicts";
import { PromptCard } from "@/components/dashboard/prompt-card";
import type { ProfileSections } from "@/lib/profiles/sections";

/**
 * Matches, for ONE case — access-matrix cell 21's read half.
 *
 * Extracted from `/matches` unchanged so both surfaces stay one implementation:
 * the student's own page and the counsellor's case route differ by the case id
 * and by nothing else. `db` is the **authenticated** client; the shortlist read
 * is decided by `ups_select_case` → `actor_case_ids()`.
 *
 * `checklistBase` is the navigation half of the same wrong-case question the
 * write side answers: a per-program checklist link that pointed at `/checklist/…`
 * would take a counsellor out of the student's case and into their own.
 */
export async function MatchesPanel({
  db,
  caseId,
  checklistBase = "",
  header,
}: {
  db: SupabaseClient<Database>;
  caseId: string | null;
  checklistBase?: string;
  /**
   * The caller's own heading. `/matches` speaks to the student about their own
   * profile; the case route speaks to a counsellor about somebody else's, and
   * pretending one voice fits both is how a surface starts telling a counsellor
   * "your Nepal TU percentage".
   */
  header?: React.ReactNode;
}) {
  const [profile, programs, universities, shortlist] = await Promise.all([
    caseId === null ? null : getProfileForCase(db, caseId),
    listAllPrograms(db),
    listAllUniversities(db),
    caseId === null ? [] : listShortlistForCase(db, caseId),
  ]);

  const sections: ProfileSections = (profile?.sections as ProfileSections | undefined) ?? {};

  const inputs = sectionsToMatchInputs(sections, {
    nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL,
  });

  // Gate the profile that carries nothing to score. Not just the empty/never-filled
  // profile — a name-only student (grade, English and budget all absent) has a
  // NON-empty profile, yet computeMatches floors every unknown to 0 and fabricates
  // "Reach · Grade short by 60%" off inputs they never entered (audit C-4, "Unknown
  // is not zero"). hasSufficientInputs abstains upstream; any one verdict input
  // present ⇒ we still render cards (never over-gate). The gate renders a matches-specific
  // prompt that names the missing inputs — NOT the dashboard's profile-incomplete card,
  // whose pickPrompt keys off a different signal (profile-row + primary-assessment existence)
  // and whose copy speaks of "sharpening a verdict" we don't show here.
  const insufficient = !hasSufficientInputs(inputs);

  const universitiesPanel = insufficient ? (
    <PromptCard prompt={{ kind: "matches-need-inputs" }} />
  ) : (
    (() => {
      const { items: matches, note: preferenceNote } = applyPreference(
        computeMatches(inputs, programs, universities),
        sections.career?.goal ?? null,
        signedInPreferenceAdapter,
        new Date(),
      );
      const goalNote = goalTradeoffNote(
        sections.career?.goal ?? null,
        sections.career?.secondaryGoals,
      );
      const statusById = new Map<string, Status>(shortlist.map((s) => [s.programId, s.status]));
      // Same coverage check the anonymous path runs, over the SAME injected catalogue, so
      // both surfaces disclose an uncovered field identically (audit C-10).
      const coverageField = uncoveredField(inputs.userField, programs);
      const strong = matches.filter((m) => m.verdict === "strong");
      const possible = matches.filter((m) => m.verdict === "possible");
      const reach = matches.filter((m) => m.verdict === "reach");
      return (
        <div className="flex flex-col gap-6">
          <PreferenceNote note={preferenceNote} />
          <GoalTradeoffNote note={goalNote} />
          <FieldCoverageNotice field={coverageField} />
          <VerdictGroup
            verdict="strong"
            matches={strong}
            statusById={statusById}
            checklistBase={checklistBase}
          />
          <VerdictGroup
            verdict="possible"
            matches={possible}
            statusById={statusById}
            checklistBase={checklistBase}
          />
          {/* Reach = the stretch schools; normally collapsed behind their count so the page
              opens on realistic picks. But when Reach is ALL there is — every match deflated
              to a reach, common since MV-120 judged budgets against tuition + living — a
              collapse leaves the page with nothing but a heading and a Show button at the
              moment the student most needs to read why they're short. In that case show the
              reach cards like any band (their honest shortfall reasons are the point). */}
          <VerdictGroup
            verdict="reach"
            matches={reach}
            statusById={statusById}
            checklistBase={checklistBase}
            initialVisible={strong.length === 0 && possible.length === 0 ? 3 : 0}
          />
          {matches.length === 0 ? (
            <p className="text-body text-ink-soft">
              No programs found yet. Complete your profile to surface matches.
            </p>
          ) : null}
        </div>
      );
    })()
  );

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      {header}
      <VerdictDisclaimer message="Program matches are rules-based estimates against published thresholds, not immigration advice. They come from published rules and can change — they are not a guarantee of any visa or admission outcome. The relevant decision-makers decide your case under the rules that apply at the time — the Department of Home Affairs for your visa, and each institution for its own admission. For advice on your own application, see a registered migration agent (OMARA) or a lawyer." />
      <PolicyBanner />
      <CostToApply />
      <MatchesTabs
        universities={universitiesPanel}
        scholarships={<ScholarshipsPanel />}
        cost={<CostEstimatePanel />}
      />
    </div>
  );
}
