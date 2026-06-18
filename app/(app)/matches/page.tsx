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
import { PolicyBanner } from "@/components/matches/policy-banner";
import { CostToApply } from "@/components/results/cost-to-apply";
import { ScholarshipsPanel } from "@/components/matches/scholarships-panel";
import { PreferenceNote } from "@/components/matches/preference-note";
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
  const inputs = sectionsToMatchInputs(sections, { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL });

  const { items: matches, note: preferenceNote } = applyPreference(
    computeMatches(inputs, programs, universities),
    sections.career?.goal ?? null,
    signedInPreferenceAdapter,
    new Date(),
  );
  const shortlistedIds = new Set(shortlist.map((s) => s.programId));
  const strong = matches.filter((m) => m.verdict === "strong");
  const possible = matches.filter((m) => m.verdict === "possible");
  const reach = matches.filter((m) => m.verdict === "reach");

  const universitiesPanel = (
    <div className="flex flex-col gap-6">
      <PreferenceNote note={preferenceNote} />
      <VerdictGroup verdict="strong" matches={strong} shortlistedIds={shortlistedIds} />
      <VerdictGroup verdict="possible" matches={possible} shortlistedIds={shortlistedIds} />
      <VerdictGroup verdict="reach" matches={reach} shortlistedIds={shortlistedIds} />
      {matches.length === 0 ? (
        <p className="text-[15px] text-ink-soft">
          No programs found yet. Complete your profile to surface matches.
        </p>
      ) : null}
    </div>
  );

  const scholarshipsPanel = <ScholarshipsPanel />;
  const costPanel = (
    <p className="text-[15px] text-ink-soft">
      Coming soon — a live cost estimate covering tuition, DHA living costs, OSHC, and
      intake-aligned forecasts rolled into one number you can plan against.
    </p>
  );

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
