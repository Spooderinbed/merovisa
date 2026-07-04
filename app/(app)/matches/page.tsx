import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { getProfile } from "@/lib/profiles/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { listShortlistForUser } from "@/lib/matches/repo";
import { computeMatches } from "@/lib/matches/compute";
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
import { PromptCard } from "@/components/dashboard/prompt-card";
import type { ProfileSections } from "@/lib/profiles/sections";

export default async function MatchesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const h = await headers();
    const next = safeNext(h.get("x-pathname")) ?? "/dashboard";
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }
  const [profile, programs, universities, shortlist] = await Promise.all([
    getProfile(supabase, user.id),
    listAllPrograms(supabase),
    listAllUniversities(supabase),
    listShortlistForUser(supabase, user.id),
  ]);

  const sections: ProfileSections = (profile?.sections as ProfileSections | undefined) ?? {};

  // Gate the empty/never-filled profile: computing verdicts off fields the user
  // never entered fabricates "Reach · Grade short by 60%" off zeroed inputs. Mirror
  // the dashboard's gate (PromptCard "profile-incomplete") instead. The dashboard's
  // pickPrompt uses the same signal — no profile data — to render this card.
  const profileEmpty = Object.keys(sections).length === 0;

  const universitiesPanel = profileEmpty ? (
    <PromptCard prompt={{ kind: "profile-incomplete" }} />
  ) : (
    (() => {
      const inputs = sectionsToMatchInputs(sections, {
        nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL,
      });
      const { items: matches, note: preferenceNote } = applyPreference(
        computeMatches(inputs, programs, universities),
        sections.career?.goal ?? null,
        signedInPreferenceAdapter,
        new Date(),
      );
      const statusById = new Map<string, Status>(shortlist.map((s) => [s.programId, s.status]));
      const strong = matches.filter((m) => m.verdict === "strong");
      const possible = matches.filter((m) => m.verdict === "possible");
      const reach = matches.filter((m) => m.verdict === "reach");
      return (
        <div className="flex flex-col gap-6">
          <PreferenceNote note={preferenceNote} />
          <VerdictGroup verdict="strong" matches={strong} statusById={statusById} />
          <VerdictGroup verdict="possible" matches={possible} statusById={statusById} />
          {/* Reach = the stretch schools; collapse them by default so the page opens on
              realistic picks. The count stays visible and they're one click away. */}
          <VerdictGroup verdict="reach" matches={reach} statusById={statusById} initialVisible={0} />
          {matches.length === 0 ? (
            <p className="text-[15px] text-ink-soft">
              No programs found yet. Complete your profile to surface matches.
            </p>
          ) : null}
        </div>
      );
    })()
  );

  const scholarshipsPanel = <ScholarshipsPanel />;
  const costPanel = <CostEstimatePanel />;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
          Matches
        </span>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Where your profile fits today.</h1>
        <p className="max-w-[64ch] text-[16px] text-ink-soft">
          Strong / Possible / Reach against each program&apos;s published thresholds. We compare
          your Nepal TU percentage directly against each program&apos;s minimum.
        </p>
      </header>
      <VerdictDisclaimer message="Program matches are rules-based estimates against published thresholds, not immigration advice. They come from published rules and can change — they are not a guarantee of any visa or admission outcome. The relevant decision-makers decide your case under the rules that apply at the time — the Department of Home Affairs for your visa, and each institution for its own admission. For advice on your own application, see a registered migration agent (OMARA) or a lawyer." />
      <PolicyBanner />
      <CostToApply />
      <MatchesTabs
        universities={universitiesPanel}
        scholarships={scholarshipsPanel}
        cost={costPanel}
      />
    </div>
  );
}
