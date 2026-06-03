import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profiles/repo";
import { computeCompleteness } from "@/lib/profiles/completeness";
import { SECTION_KEYS } from "@/lib/profiles/sections";
import type { ProfileSections, SectionKey } from "@/lib/profiles/sections";
import { CompletenessRing } from "@/components/profile/completeness-ring";
import { SectionAccordion } from "@/components/profile/section-accordion";
import { PersonalEditor } from "@/components/profile/editors/personal-editor";

const TITLES: Record<SectionKey, string> = {
  "personal":        "Personal information",
  "destination":     "Destination preferences",
  "academic":        "Academic background",
  "intended-study":  "Intended study",
  "english":         "English proficiency",
  "gap":             "Study gap",
  "work":            "Work experience",
  "finance":         "Financial capacity",
  "immigration":     "Immigration & visa history",
  "family":          "Family information",
  "career":          "Career goals",
  "scholarships":    "Scholarship profile",
  "deal-breakers":   "Deal-breakers",
};

function summarize(key: SectionKey, sections: ProfileSections): string {
  const s = (sections as Record<string, Record<string, unknown> | undefined>)[key];
  if (!s) return "";
  switch (key) {
    case "personal":      return [s.name as string, s.age ? `${s.age}` : "", s.intakeIso ? `${s.intakeIso} intake` : ""].filter(Boolean).join(" · ");
    case "destination":   return [s.primary as string, ...((s.alternates as string[] | undefined) ?? [])].filter(Boolean).join(", ");
    case "academic":      return [s.institution as string, s.gradePercent ? `${s.gradePercent}%` : "", s.degree as string].filter(Boolean).join(" · ");
    case "intended-study":return [s.level as string, s.field as string, s.specialisation as string].filter(Boolean).join(" · ");
    case "english":       return s.overall ? `IELTS ${s.overall} — ${s.reportUploaded ? "uploaded" : "report not uploaded"}` : "";
    case "gap":           return [s.years ? `${s.years} year` : "", ...((s.reasons as string[] | undefined) ?? [])].filter(Boolean).join(" · ");
    case "work":          return [s.title as string, s.years ? `${s.years} yr` : "", s.docs ? "" : "docs missing"].filter(Boolean).join(" · ");
    case "finance":       return [s.source as string, s.proofUploaded ? "" : "proof not uploaded"].filter(Boolean).join(" · ");
    case "immigration":   return [s.refusals ? `${s.refusals} refusals` : "", s.travelled === undefined ? "travel history unknown" : ""].filter(Boolean).join(" · ");
    case "family":        return (s.situation as string) ?? "";
    case "career":        return [s.goal as string, s.targetRole as string].filter(Boolean).join(" · ");
    case "scholarships":  return ((s.profile as string[] | undefined) ?? []).join(", ");
    case "deal-breakers": return ((s.mustHaves as string[] | undefined) ?? []).join(", ");
  }
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user!;
  const profileRow = await getProfile(supabase, user.id);
  const sections = (profileRow?.sections as ProfileSections | undefined) ?? {};
  const { pct, status } = computeCompleteness(sections);
  const counts = SECTION_KEYS.reduce(
    (acc, k) => {
      acc[status[k]] += 1;
      return acc;
    },
    { complete: 0, partial: 0, empty: 0 } as Record<"complete" | "partial" | "empty", number>,
  );

  const displayName = sections.personal?.name ?? "Add your name";
  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-6 px-5 py-10 lg:grid-cols-[280px_1fr]">
      <header className="flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">{displayName}</h1>
        <span className="text-[15px] text-ink-soft">{user.email}</span>
      </header>
      <CompletenessRing pct={pct} complete={counts.complete} partial={counts.partial} empty={counts.empty} />
      <div className="flex flex-col gap-3">
        {SECTION_KEYS.map((key) => (
          <SectionAccordion
            key={key}
            title={TITLES[key]}
            summary={summarize(key, sections)}
            status={status[key]}
          >
            {key === "personal" ? (
              <PersonalEditor initial={sections.personal ?? {}} />
            ) : (
              <p className="text-[14px] text-ink-soft">Editing coming in Phase 2.</p>
            )}
          </SectionAccordion>
        ))}
      </div>
    </div>
  );
}
