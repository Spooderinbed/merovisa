import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profiles/repo";
import { listAllPrograms, listAllUniversities } from "@/lib/programs/repo";
import { listShortlistForUser } from "@/lib/matches/repo";
import { computeMatches } from "@/lib/matches/compute";
import { NEPAL_ASSESSMENT_LEVEL } from "@/lib/programs/policy";
import { MatchesTabs } from "@/components/matches/matches-tabs";
import { VerdictGroup } from "@/components/matches/verdict-group";
import { PolicyBanner } from "@/components/matches/policy-banner";
import type { ProfileSections } from "@/lib/profiles/sections";

export default async function MatchesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [profile, programs, universities, shortlist] = await Promise.all([
    getProfile(supabase, user!.id),
    listAllPrograms(supabase),
    listAllUniversities(supabase),
    listShortlistForUser(supabase, user!.id),
  ]);

  const sections: ProfileSections = (profile?.sections as ProfileSections | undefined) ?? {};
  const inputs = {
    userGradePercent: sections.academic?.gradePercent ?? null,
    userEnglishOverall: sections.english?.overall ?? null,
    userEnglishBand: sections.english?.overall ?? null, // proxy: assume per-band = overall until uploaded report parsed
    userBudgetAud: budgetToAud(sections.finance?.total ?? null, sections.finance?.currency ?? null),
    userField: sections["intended-study"]?.field ?? null,
    policy: { nepalAssessmentLevel: NEPAL_ASSESSMENT_LEVEL },
  };

  const matches = computeMatches(inputs, programs, universities);
  const shortlistedIds = new Set(shortlist.map((s) => s.programId));
  const strong = matches.filter((m) => m.verdict === "strong");
  const possible = matches.filter((m) => m.verdict === "possible");
  const reach = matches.filter((m) => m.verdict === "reach");

  const universitiesPanel = (
    <div className="flex flex-col gap-6">
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

  const scholarshipsPanel = (
    <p className="text-[15px] text-ink-soft">
      Scholarship matching lands in Phase 4 alongside the plan.
    </p>
  );
  const costPanel = (
    <p className="text-[15px] text-ink-soft">
      Live cost estimate (tuition + DHA living + OSHC) lands in Phase 4.
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
          Strong / Possible / Reach against each program&apos;s published thresholds. Grade
          conversion follows the Nepal TU &rarr; Australian WAM table from our research.
        </p>
      </header>
      <PolicyBanner />
      <MatchesTabs
        universities={universitiesPanel}
        scholarships={scholarshipsPanel}
        cost={costPanel}
      />
    </div>
  );
}

// Budget conversion — rough static rates. Replace with FX lookup later.
function budgetToAud(total: number | null, currency: string | null): number | null {
  if (total == null) return null;
  switch (currency) {
    case "AUD":
      return total;
    case "USD":
      return total * 1.5;
    case "NPR":
      return total / 100; // ~AUD 1 = NPR 90-100
    case "INR":
      return total / 55; // ~AUD 1 = INR 55
    case "BDT":
      return total / 75;
    case "PKR":
      return total / 200;
    case "NGN":
      return total / 1000;
    default:
      return total;
  }
}
